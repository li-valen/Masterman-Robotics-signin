import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from datetime import date
import os
import sys

def initialize_firebase():
    cred_path = 'serviceAccountKey.json'
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    else:
        parent_cred_path = os.path.join('..', cred_path)
        if os.path.exists(parent_cred_path):
             cred = credentials.Certificate(parent_cred_path)
             firebase_admin.initialize_app(cred)
        else:
            print("Error: serviceAccountKey.json not found.")
            sys.exit(1)
    return firestore.client()

def verify_cleanup():
    db = initialize_firebase()
    today_str = date.today().isoformat()
    
    docs = db.collection('attendance').stream()
    
    issues_found = 0
    
    for doc in docs:
        day_str = doc.id
        if day_str >= today_str:
            continue
            
        data = doc.to_dict()
        for uid, record in data.items():
            if not isinstance(record, dict):
                continue
                
            if record.get('signed_in', False):
                print(f"ISSUE: {uid} is still signed in on {day_str}")
                issues_found += 1
            
            if record.get('hours') == 2.0 and record.get('signed_in') is False:
                 # This is likely one we fixed, or just happened to be 2 hours.
                 # We can't strictly distinguish without more history, but it's a good sign.
                 pass

    if issues_found == 0:
        print("Verification SUCCESS: No old sign-ins found.")
    else:
        print(f"Verification FAILED: Found {issues_found} old sign-ins.")

if __name__ == "__main__":
    verify_cleanup()
