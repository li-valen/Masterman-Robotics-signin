import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from datetime import datetime, timedelta, date
import os
import sys

# Add parent directory to path to import from server.py if needed, 
# but we'll just use standalone logic here for simplicity and safety.

def initialize_firebase():
    cred_path = 'serviceAccountKey.json'
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print(f"Initialized Firebase with {cred_path}")
    else:
        # Try to find it in the parent directory
        parent_cred_path = os.path.join('..', cred_path)
        if os.path.exists(parent_cred_path):
             cred = credentials.Certificate(parent_cred_path)
             firebase_admin.initialize_app(cred)
             print(f"Initialized Firebase with {parent_cred_path}")
        else:
            print("Error: serviceAccountKey.json not found.")
            sys.exit(1)
    
    return firestore.client()

def cleanup_attendance():
    db = initialize_firebase()
    
    today_str = date.today().isoformat()
    print(f"Today is: {today_str}")
    
    # Get all attendance documents
    docs = db.collection('attendance').stream()
    
    updated_count = 0
    
    for doc in docs:
        day_str = doc.id
        
        # Skip today
        if day_str == today_str:
            print(f"Skipping today ({day_str})")
            continue
            
        # Check if day is in the future (just in case)
        if day_str > today_str:
            print(f"Skipping future date ({day_str})")
            continue
            
        data = doc.to_dict()
        day_updated = False
        
        for uid, record in data.items():
            if not isinstance(record, dict):
                continue
                
            if record.get('signed_in', False):
                print(f"Found open sign-in for {uid} on {day_str}")
                
                # Calculate new sign-out time (sign_in_time + 2 hours)
                sign_in_time_str = record.get('sign_in_time')
                if sign_in_time_str:
                    try:
                        sign_in_time = datetime.fromisoformat(sign_in_time_str)
                        sign_out_time = sign_in_time + timedelta(hours=2)
                        
                        # Update record
                        record['signed_in'] = False
                        record['sign_out_time'] = sign_out_time.isoformat()
                        record['hours'] = 2.0
                        
                        day_updated = True
                        updated_count += 1
                        print(f"  -> Updated: Set to 2 hours, signed out at {sign_out_time.isoformat()}")
                    except ValueError:
                        print(f"  -> Error parsing time for {uid}: {sign_in_time_str}")
                else:
                    print(f"  -> Error: No sign_in_time for {uid}")
        
        if day_updated:
            # Update the document
            db.collection('attendance').document(day_str).set(data)
            print(f"Saved updates for {day_str}")
            
    print(f"\nCleanup complete. Updated {updated_count} records.")

if __name__ == "__main__":
    cleanup_attendance()
