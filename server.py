'''
Flask Backend Server for NFC Reader Web Interface
'''
from flask import Flask, jsonify, request
from flask_cors import CORS
from smartcard.System import readers
from smartcard.util import toHexString
from smartcard.ATR import ATR
import threading
import time
import queue
import json
import os
from datetime import datetime, date
from dotenv import load_dotenv

# Load environment variables from .env (if present). This allows using a local
# `.env` file instead of exporting env vars manually.
load_dotenv()
import requests

# Note: we previously supported ngrok via pyngrok. That was removed in favor of
# Cloudflare Tunnel (`cloudflared`) for stable, free hostnames without port
# forwarding. To expose the local server use `cloudflared tunnel --url http://localhost:5001`
# or create a named Cloudflare Tunnel and route DNS (see `README.md` and `scripts/`).

app = Flask(__name__)
# Configure CORS origins via environment variable `FRONTEND_ORIGINS`.
# If not provided, allow all origins (same as before).
frontend_origins = os.environ.get('FRONTEND_ORIGINS')
if frontend_origins:
    # comma-separated list of origins
    origins = [o.strip() for o in frontend_origins.split(',') if o.strip()]
    CORS(app, origins=origins)
else:
    CORS(app)

# Global state
nfc_reader = None
nfc_connection = None
card_detection_active = False
card_detection_thread = None
card_status_queue = queue.Queue()
current_card_uid = None
current_card_info = None
loaded_key = None
sign_in_mode = True  # True = sign in mode, False = sign out mode

# Card names storage file
CARD_NAMES_FILE = 'card_names.json'
# Attendance storage file
ATTENDANCE_FILE = 'attendance.json'

# Card name mapping
CARD_NAME_MAP = {
    "00 01": "MIFARE Classic 1K",
    "00 02": "MIFARE Classic 4K",
    "00 03": "MIFARE Ultralight",
    "00 26": "MIFARE Mini",
    "F0 04": "Topaz and Jewel",
    "F0 11": "FeliCa 212K/424K"
}

def load_card_names():
    """Load card names from JSON file"""
    if os.path.exists(CARD_NAMES_FILE):
        try:
            with open(CARD_NAMES_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_card_names(card_names):
    """Save card names to JSON file"""
    try:
        with open(CARD_NAMES_FILE, 'w') as f:
            json.dump(card_names, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving card names: {e}")
        return False

def get_card_name(uid):
    """Get the saved name for a card UID"""
    if uid is None:
        return None
    card_names = load_card_names()
    return card_names.get(uid, None)

def set_card_name(uid, name):
    """Set the name for a card UID"""
    if uid is None:
        return False
    card_names = load_card_names()
    card_names[uid] = name
    return save_card_names(card_names)

def load_attendance():
    """Load attendance data from JSON file"""
    if os.path.exists(ATTENDANCE_FILE):
        try:
            with open(ATTENDANCE_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_attendance(attendance_data):
    """Save attendance data to JSON file"""
    try:
        with open(ATTENDANCE_FILE, 'w') as f:
            json.dump(attendance_data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving attendance: {e}")
        return False


def _push_attendance_to_remote(payload: dict):
    """Sends attendance payload to remote endpoint if configured.

    This is synchronous and meant to be called inside a thread.
    """
    remote_url = os.environ.get('REMOTE_SAVE_URL')
    if not remote_url:
        return
    headers = {'Content-Type': 'application/json'}
    token = os.environ.get('REMOTE_SAVE_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        resp = requests.post(remote_url, json=payload, headers=headers, timeout=10)
        if resp.status_code >= 400:
            print(f"Remote save failed ({resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"Error pushing attendance to remote: {e}")


def push_attendance_to_remote_async(payload: dict):
    """Fire-and-forget push to remote endpoint."""
    try:
        t = threading.Thread(target=_push_attendance_to_remote, args=(payload,), daemon=True)
        t.start()
    except Exception as e:
        print(f"Failed to start remote push thread: {e}")

def record_sign_in(uid):
    """Record a sign-in for a card UID today"""
    if uid is None:
        return False
    attendance = load_attendance()
    today = date.today().isoformat()
    
    if today not in attendance:
        attendance[today] = {}
    
    # If already signed in today, don't overwrite - just update sign-in time
    if uid in attendance[today] and attendance[today][uid].get("signed_in", False):
        # Already signed in, update sign-in time
        attendance[today][uid]["sign_in_time"] = datetime.now().isoformat()
    else:
        # New sign-in
        attendance[today][uid] = {
            "sign_in_time": datetime.now().isoformat(),
            "signed_in": True,
            "sign_out_time": None,
            "hours": 0
        }
    
    saved = save_attendance(attendance)
    # After saving locally, attempt to push the new attendance day to a remote endpoint
    try:
        payload = {"date": today, "attendance": attendance.get(today, {}), "card_names": load_card_names()}
        push_attendance_to_remote_async(payload)
    except Exception:
        pass
    return saved


def record_sign_out(uid):
    """Record a sign-out for a card UID today and calculate hours"""
    if uid is None:
        return False
    attendance = load_attendance()
    today = date.today().isoformat()
    
    if today not in attendance or uid not in attendance[today]:
        return False
    
    if not attendance[today][uid].get("signed_in", False):
        return False
    
    sign_out_time = datetime.now()
    sign_in_time_str = attendance[today][uid].get("sign_in_time")
    
    if sign_in_time_str:
        sign_in_time = datetime.fromisoformat(sign_in_time_str)
        time_diff = sign_out_time - sign_in_time
        hours = time_diff.total_seconds() / 3600.0  # Convert to hours
        
        attendance[today][uid]["sign_out_time"] = sign_out_time.isoformat()
        attendance[today][uid]["hours"] = round(hours, 2)
        attendance[today][uid]["signed_in"] = False
    
    saved = save_attendance(attendance)
    # After saving locally, push day's attendance to remote if configured
    try:
        payload = {"date": today, "attendance": attendance.get(today, {}), "card_names": load_card_names()}
        push_attendance_to_remote_async(payload)
    except Exception:
        pass
    return saved

def has_signed_in_today(uid):
    """Check if a card UID has signed in today"""
    if uid is None:
        return False
    attendance = load_attendance()
    today = date.today().isoformat()
    
    if today not in attendance:
        return False


    def periodic_remote_sync(interval_minutes: int = 10):
        """Start a background thread that pushes the full attendance and card names to the remote endpoint every `interval_minutes` minutes.

        This uses the internal synchronous `_push_attendance_to_remote` helper inside the thread to avoid creating too many short-lived threads.
        """
        def _loop():
            print(f"Starting periodic remote sync every {interval_minutes} minute(s)")
            while True:
                try:
                    attendance = load_attendance()
                    payload = {"attendance": attendance, "card_names": load_card_names()}
                    _push_attendance_to_remote(payload)
                except Exception as e:
                    print(f"Periodic remote sync error: {e}")
                time.sleep(interval_minutes * 60)

        t = threading.Thread(target=_loop, daemon=True)
        t.start()
        return t


    @app.route('/api/trigger-remote-sync', methods=['POST'])
    def trigger_remote_sync():
        """Manually trigger an immediate push of the current attendance and card names to the configured remote endpoint.

        Returns JSON indicating whether the trigger was started. This does not wait for the remote call to finish.
        """
        try:
            attendance = load_attendance()
            payload = {"attendance": attendance, "card_names": load_card_names()}
            push_attendance_to_remote_async(payload)
            return jsonify({"success": True, "message": "Triggered remote sync"})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
    
    return uid in attendance[today] and attendance[today][uid].get("signed_in", False)

def get_attendance_status():
    """Get attendance status for all registered cards for today"""
    card_names = load_card_names()
    attendance = load_attendance()
    today = date.today().isoformat()
    
    status_list = []
    for uid, name in card_names.items():
        has_signed_in = today in attendance and uid in attendance[today] and attendance[today][uid].get("signed_in", False)
        sign_in_time = None
        sign_out_time = None
        hours = 0
        
        if today in attendance and uid in attendance[today]:
            entry = attendance[today][uid]
            sign_in_time = entry.get("sign_in_time")
            sign_out_time = entry.get("sign_out_time")
            hours = entry.get("hours", 0)
        
        status_list.append({
            "uid": uid,
            "name": name,
            "signedIn": has_signed_in,
            "signInTime": sign_in_time,
            "signOutTime": sign_out_time,
            "hours": hours
        })
    
    return status_list

def get_person_profile(uid):
    """Get complete profile data for a person including all attendance history"""
    if uid is None:
        return None

    card_names = load_card_names()
    # If the UID isn't in saved card names, still build a profile using the
    # UID as a fallback name. Previously we returned `None` which caused the
    # UI to show "Profile not found" for recently-seen cards that haven't
    # yet been persisted to `card_names.json`.
    attendance = load_attendance()
    name = card_names.get(uid, uid)
    
    # Get all attendance records for this person
    attendance_history = []
    total_hours = 0
    days_attended = 0
    
    # Get all dates from attendance
    all_dates = sorted(attendance.keys(), reverse=True)
    
    for day in all_dates:
        if uid in attendance[day]:
            entry = attendance[day][uid]
            sign_in_time = entry.get("sign_in_time")
            sign_out_time = entry.get("sign_out_time")
            hours = entry.get("hours", 0)
            signed_in = entry.get("signed_in", False)
            
            attended = sign_in_time is not None
            
            attendance_history.append({
                "date": day,
                "signInTime": sign_in_time,
                "signOutTime": sign_out_time,
                "hours": hours,
                "signedIn": signed_in,
                "attended": attended
            })
            
            if attended:
                days_attended += 1
                total_hours += hours
        else:
            # Day exists but person didn't attend
            attendance_history.append({
                "date": day,
                "signInTime": None,
                "signOutTime": None,
                "hours": 0,
                "signedIn": False,
                "attended": False
            })
    
    # Calculate statistics
    total_days = len(all_dates)
    days_missed = total_days - days_attended
    average_hours = total_hours / days_attended if days_attended > 0 else 0
    attendance_rate = (days_attended / total_days * 100) if total_days > 0 else 0
    
    return {
        "uid": uid,
        "name": name,
        "totalHours": round(total_hours, 2),
        "daysAttended": days_attended,
        "daysMissed": days_missed,
        "totalDays": total_days,
        "averageHours": round(average_hours, 2),
        "attendanceRate": round(attendance_rate, 1),
        "attendanceHistory": attendance_history
    }

def get_fresh_connection():
    """Get a fresh connection to the NFC reader"""
    global nfc_reader
    if nfc_reader is None:
        r = readers()
        if len(r) < 1:
            return None
        nfc_reader = r[0]
    return nfc_reader.createConnection()

def init_nfc_reader():
    """Initialize NFC reader connection"""
    global nfc_reader, nfc_connection
    try:
        r = readers()
        if len(r) < 1:
            return {"error": "No readers available!"}
        nfc_reader = r[0]
        nfc_connection = nfc_reader.createConnection()
        # Test the connection by trying to connect (without requiring a card)
        try:
            nfc_connection.connect()
        except:
            # Connection might fail if no card, but reader is still available
            pass
        return {"success": True, "reader": str(nfc_reader)}
    except Exception as e:
        return {"error": str(e)}

def check_card_present():
    """Check if a card is present on the reader"""
    global nfc_connection, nfc_reader
    try:
        if nfc_reader is None:
            return False
        # Create a fresh connection each time to avoid hanging
        connection = nfc_reader.createConnection()
        connection.connect()
        # Try to get UID - if it works, card is present
        cmd = [0xFF, 0xCA, 0x00, 0x00, 0x00]
        data, sw1, sw2 = connection.transmit(cmd)
        return (sw1, sw2) == (0x90, 0x00)
    except:
        return False

def get_card_uid():
    """Get the UID of the card currently on the reader"""
    global nfc_reader
    try:
        if nfc_reader is None:
            return None
        # Create a fresh connection each time
        connection = nfc_reader.createConnection()
        connection.connect()
        cmd = [0xFF, 0xCA, 0x00, 0x00, 0x00]
        data, sw1, sw2 = connection.transmit(cmd)
        if (sw1, sw2) == (0x90, 0x00):
            return toHexString(data)
        return None
    except Exception as e:
        return None

def get_card_info():
    """Get detailed information about the card"""
    global nfc_reader
    try:
        if nfc_reader is None:
            return None
        # Create a fresh connection each time
        connection = nfc_reader.createConnection()
        connection.connect()
        atr = ATR(connection.getATR())
        hb = toHexString(atr.getHistoricalBytes())
        cardname = hb[-17:-12] if len(hb) >= 17 else "unknown"
        name = CARD_NAME_MAP.get(cardname, "Unknown")
        
        return {
            "cardName": name,
            "t0Supported": atr.isT0Supported(),
            "t1Supported": atr.isT1Supported(),
            "t15Supported": atr.isT15Supported(),
            "atr": toHexString(connection.getATR())
        }
    except Exception as e:
        return None

def read_card_with_retry(max_attempts=3, delay=0.1):
    """Attempt to read the card UID (and info) with retries to avoid transient failures."""
    uid = None
    info = None
    for attempt in range(max_attempts):
        uid = get_card_uid()
        if uid:
            info = get_card_info()
            break
        time.sleep(delay)
    return uid, info


def card_detection_loop():
    """Background thread that continuously checks for card presence"""
    global card_detection_active, current_card_uid, current_card_info, card_status_queue, nfc_reader
    
    last_card_state = False
    
    while card_detection_active:
        try:
            if nfc_reader is None:
                time.sleep(1)
                continue
                
            card_present = check_card_present()
            
            if card_present != last_card_state:
                last_card_state = card_present
                
                if card_present:
                    # Card detected
                    uid, info = read_card_with_retry()
                    card_name = get_card_name(uid)
                    current_card_uid = uid
                    current_card_info = info
                    
                    if not uid:
                        # Failed to read UID; reset state so we retry on next loop iteration
                        current_card_uid = None
                        current_card_info = None
                        last_card_state = False
                        card_status_queue.put({
                            "status": "card_read_failed",
                            "timestamp": time.time()
                        })
                        continue
                    
                    # Record sign-in or sign-out based on mode
                    if uid and card_name:
                        global sign_in_mode
                        if sign_in_mode:
                            # Sign in mode: record sign-in
                            record_sign_in(uid)
                            card_status_queue.put({
                                "status": "card_detected",
                                "uid": uid,
                                "name": card_name,
                                "info": info,
                                "action": "signed_in",
                                "timestamp": time.time()
                            })
                        else:
                            # Sign out mode: record sign-out
                            if record_sign_out(uid):
                                card_status_queue.put({
                                    "status": "card_detected",
                                    "uid": uid,
                                    "name": card_name,
                                    "info": info,
                                    "action": "signed_out",
                                    "timestamp": time.time()
                                })
                            else:
                                # Not signed in, can't sign out
                                card_status_queue.put({
                                    "status": "card_detected",
                                    "uid": uid,
                                    "name": card_name,
                                    "info": info,
                                    "action": "sign_out_failed",
                                    "timestamp": time.time()
                                })
                    else:
                        card_status_queue.put({
                            "status": "card_detected",
                            "uid": uid,
                            "name": card_name,
                            "info": info,
                            "timestamp": time.time()
                        })
                else:
                    # Card removed - don't auto sign-out anymore, only when explicitly in sign-out mode
                    current_card_uid = None
                    current_card_info = None
                    card_status_queue.put({
                        "status": "card_removed",
                        "timestamp": time.time()
                    })
            
            time.sleep(0.5)  # Poll every 500ms
        except Exception as e:
            print(f"Error in card detection loop: {e}")
            time.sleep(1)

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get current NFC reader and card status"""
    global nfc_reader, current_card_uid, current_card_info, card_detection_active, sign_in_mode
    
    # Always check if readers are available
    try:
        r = readers()
        if len(r) < 1:
            return jsonify({
                "readerConnected": False,
                "readerName": None,
                "cardPresent": False,
                "cardUid": None,
                "cardInfo": None,
                "detectionActive": card_detection_active,
                "signInMode": sign_in_mode,
                "error": "No readers available"
            })
        
        # Initialize if not already done
        if nfc_reader is None or str(nfc_reader) != str(r[0]):
            init_result = init_nfc_reader()
            if "error" in init_result:
                return jsonify({
                    "readerConnected": False,
                    "readerName": None,
                    "cardPresent": False,
                    "cardUid": None,
                    "cardInfo": None,
                    "detectionActive": card_detection_active,
                    "signInMode": sign_in_mode,
                    "error": init_result.get("error", "Failed to initialize reader")
                })
    except Exception as e:
        return jsonify({
            "readerConnected": False,
            "readerName": None,
            "cardPresent": False,
            "cardUid": None,
            "cardInfo": None,
            "detectionActive": card_detection_active,
            "signInMode": sign_in_mode,
            "error": str(e)
        })
    
    card_present = check_card_present()
    uid = current_card_uid if card_present else None
    info = current_card_info if card_present else None
    card_name = get_card_name(uid) if uid else None
    
    return jsonify({
        "readerConnected": nfc_reader is not None,
        "readerName": str(nfc_reader) if nfc_reader else None,
        "cardPresent": card_present,
        "cardUid": uid,
        "cardName": card_name,
        "cardInfo": info,
        "detectionActive": card_detection_active
    })

@app.route('/api/start-detection', methods=['POST'])
def start_detection():
    """Start automatic card detection"""
    global card_detection_active, card_detection_thread, nfc_reader
    
    if nfc_reader is None:
        init_result = init_nfc_reader()
        if "error" in init_result:
            return jsonify(init_result), 500
    
    if not card_detection_active:
        card_detection_active = True
        card_detection_thread = threading.Thread(target=card_detection_loop, daemon=True)
        card_detection_thread.start()
    
    return jsonify({"success": True, "message": "Card detection started"})

@app.route('/api/stop-detection', methods=['POST'])
def stop_detection():
    """Stop automatic card detection"""
    global card_detection_active
    card_detection_active = False
    return jsonify({"success": True, "message": "Card detection stopped"})

@app.route('/api/get-uid', methods=['POST'])
def api_get_uid():
    """Manually get card UID"""
    try:
        uid = get_card_uid()
        if uid:
            return jsonify({"success": True, "uid": uid})
        else:
            return jsonify({"success": False, "error": "No card detected or failed to read UID"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/get-info', methods=['POST'])
def api_get_info():
    """Get card information"""
    try:
        info = get_card_info()
        if info:
            return jsonify({"success": True, "info": info})
        else:
            return jsonify({"success": False, "error": "No card detected or failed to read info"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/firmware-version', methods=['POST'])
def api_firmware_version():
    """Get firmware version of the reader"""
    try:
        connection = get_fresh_connection()
        if connection is None:
            return jsonify({"success": False, "error": "No readers available"}), 500
        
        connection.connect()
        cmd = [0xFF, 0x00, 0x48, 0x00, 0x00]
        data, sw1, sw2 = connection.transmit(cmd)
        version = ''.join(chr(i) for i in data) + chr(sw1) + chr(sw2)
        return jsonify({"success": True, "version": version})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/mute', methods=['POST'])
def api_mute():
    """Disable beep sound"""
    try:
        connection = get_fresh_connection()
        if connection is None:
            return jsonify({"success": False, "error": "No readers available"}), 500
        
        connection.connect()
        cmd = [0xFF, 0x00, 0x52, 0x00, 0x00]
        data, sw1, sw2 = connection.transmit(cmd)
        if (sw1, sw2) == (0x90, 0x00):
            return jsonify({"success": True, "message": "Beep disabled"})
        else:
            return jsonify({"success": False, "error": "Failed to disable beep"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/unmute', methods=['POST'])
def api_unmute():
    """Enable beep sound"""
    try:
        connection = get_fresh_connection()
        if connection is None:
            return jsonify({"success": False, "error": "No readers available"}), 500
        
        connection.connect()
        cmd = [0xFF, 0x00, 0x52, 0xFF, 0x00]
        data, sw1, sw2 = connection.transmit(cmd)
        if (sw1, sw2) == (0x90, 0x00):
            return jsonify({"success": True, "message": "Beep enabled"})
        else:
            return jsonify({"success": False, "error": "Failed to enable beep"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/load-key', methods=['POST'])
def api_load_key():
    """Load a key for authentication"""
    global loaded_key
    try:
        data = request.get_json()
        key = data.get('key', '')
        
        if len(key) != 12:
            return jsonify({"success": False, "error": "Key must be 12 hex characters (6 bytes)"}), 400
        
        connection = get_fresh_connection()
        if connection is None:
            return jsonify({"success": False, "error": "No readers available"}), 500
        
        connection.connect()
        cmd = [0xFF, 0x82, 0x00, 0x00, 0x06]
        key_bytes = [int(key[i:i+2], 16) for i in range(0, 12, 2)]
        cmd.extend(key_bytes)
        
        data, sw1, sw2 = connection.transmit(cmd)
        if (sw1, sw2) == (0x90, 0x00):
            loaded_key = key
            return jsonify({"success": True, "message": "Key loaded successfully"})
        else:
            return jsonify({"success": False, "error": "Failed to load key"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/read-sector', methods=['POST'])
def api_read_sector():
    """Read a sector from the card"""
    global loaded_key
    try:
        data = request.get_json()
        sector = int(data.get('sector', 0))
        
        if loaded_key is None:
            return jsonify({"success": False, "error": "No key loaded. Please load a key first."}), 400
        
        connection = get_fresh_connection()
        if connection is None:
            return jsonify({"success": False, "error": "No readers available"}), 500
        
        connection.connect()
        
        # Try Key A first
        cmd = [0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, sector * 4, 0x60, 0x00]
        data, sw1, sw2 = connection.transmit(cmd)
        key_type = "A"
        
        if (sw1, sw2) != (0x90, 0x00):
            # Try Key B
            cmd = [0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, sector * 4, 0x61, 0x00]
            data, sw1, sw2 = connection.transmit(cmd)
            key_type = "B"
        
        if (sw1, sw2) != (0x90, 0x00):
            return jsonify({"success": False, "error": "Failed to authenticate sector"}), 400
        
        # Read blocks
        blocks = []
        for block in range(sector * 4, sector * 4 + 4):
            cmd = [0xFF, 0xB0, 0x00, block, 16]
            data, sw1, sw2 = connection.transmit(cmd)
            if (sw1, sw2) == (0x90, 0x00):
                hex_data = toHexString(data)
                ascii_data = ''.join(chr(i) if 32 <= i < 127 else '.' for i in data)
                blocks.append({
                    "block": block,
                    "hex": hex_data,
                    "ascii": ascii_data
                })
        
        return jsonify({
            "success": True,
            "sector": sector,
            "keyType": key_type,
            "blocks": blocks
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/poll-status', methods=['GET'])
def poll_status():
    """Poll for card status updates (for polling-based real-time updates)"""
    try:
        if not card_status_queue.empty():
            status = card_status_queue.get()
            return jsonify({"success": True, "update": status})
        return jsonify({"success": True, "update": None})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/save-card-name', methods=['POST'])
def save_card_name():
    """Save a name for a card UID"""
    try:
        data = request.get_json()
        uid = data.get('uid')
        name = data.get('name', '').strip()
        
        if not uid:
            return jsonify({"success": False, "error": "UID is required"}), 400
        
        if not name:
            return jsonify({"success": False, "error": "Name cannot be empty"}), 400
        
        if set_card_name(uid, name):
            return jsonify({"success": True, "message": f"Card name '{name}' saved successfully"})
        else:
            return jsonify({"success": False, "error": "Failed to save card name"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/get-card-name', methods=['GET'])
def get_card_name_api():
    """Get the saved name for a card UID"""
    try:
        uid = request.args.get('uid')
        if not uid:
            return jsonify({"success": False, "error": "UID is required"}), 400
        
        name = get_card_name(uid)
        return jsonify({"success": True, "name": name})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/get-all-card-names', methods=['GET'])
def get_all_card_names():
    """Get all saved card names"""
    try:
        card_names = load_card_names()
        return jsonify({"success": True, "cardNames": card_names})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/record-sign-in', methods=['POST'])
def record_sign_in_api():
    """Record a sign-in for a card"""
    try:
        data = request.get_json()
        uid = data.get('uid')
        
        if not uid:
            return jsonify({"success": False, "error": "UID is required"}), 400
        
        if record_sign_in(uid):
            card_name = get_card_name(uid)
            return jsonify({
                "success": True,
                "message": f"Sign-in recorded for {card_name or uid}",
                "name": card_name
            })
        else:
            return jsonify({"success": False, "error": "Failed to record sign-in"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/attendance-status', methods=['GET'])
def attendance_status_api():
    """Get attendance status for all registered cards"""
    try:
        status_list = get_attendance_status()
        return jsonify({"success": True, "attendance": status_list})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/person-profile', methods=['GET'])
def person_profile_api():
    """Get profile data for a specific person"""
    try:
        uid = request.args.get('uid')
        if not uid:
            return jsonify({"success": False, "error": "UID is required"}), 400
        
        profile = get_person_profile(uid)
        if profile is None:
            return jsonify({"success": False, "error": "Person not found"}), 404
        
        return jsonify({"success": True, "profile": profile})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/record-sign-out', methods=['POST'])
def record_sign_out_api():
    """Manually record a sign-out for a card"""
    try:
        data = request.get_json()
        uid = data.get('uid')
        
        if not uid:
            return jsonify({"success": False, "error": "UID is required"}), 400
        
        if record_sign_out(uid):
            card_name = get_card_name(uid)
            return jsonify({
                "success": True,
                "message": f"Sign-out recorded for {card_name or uid}",
                "name": card_name
            })
        else:
            return jsonify({"success": False, "error": "Failed to record sign-out or not signed in"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/set-mode', methods=['POST'])
def set_mode():
    """Set the sign-in/sign-out mode"""
    global sign_in_mode
    try:
        data = request.get_json()
        mode = data.get('mode')
        
        if mode not in ['sign_in', 'sign_out']:
            return jsonify({"success": False, "error": "Mode must be 'sign_in' or 'sign_out'"}), 400
        
        sign_in_mode = (mode == 'sign_in')
        return jsonify({
            "success": True,
            "message": f"Mode set to {'Sign In' if sign_in_mode else 'Sign Out'}",
            "mode": "sign_in" if sign_in_mode else "sign_out"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/get-mode', methods=['GET'])
def get_mode():
    """Get the current sign-in/sign-out mode"""
    global sign_in_mode
    return jsonify({
        "success": True,
        "mode": "sign_in" if sign_in_mode else "sign_out"
    })

if __name__ == '__main__':
    # Initialize reader on startup
    init_nfc_reader()
    # Optionally start periodic remote sync if REMOTE_SYNC_INTERVAL_MIN is set
    try:
        interval_min = int(os.environ.get('REMOTE_SYNC_INTERVAL_MIN', '0') or '0')
        if interval_min > 0:
            periodic_remote_sync(interval_min)
    except Exception:
        # ignore invalid env value
        pass
    # For local/public exposure, prefer Cloudflare Tunnel (cloudflared).
    # To run a quick ephemeral tunnel:
    #   cloudflared tunnel --url http://localhost:5001
    # Or create a named tunnel and route DNS (see `scripts/cloudflared_setup.sh`).

    # Start Flask app
    app.run(host='0.0.0.0', port=5001, debug=True)

