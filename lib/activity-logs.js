import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

const ACTIVITY_LOGS_COLLECTION = "activity_logs";

export async function logActivity({ ownerUid, userEmail, action, details = {} }) {
  if (!ownerUid) {
    throw new Error("ownerUid is required for activity logs.");
  }
  if (!action) {
    throw new Error("action is required for activity logs.");
  }

  await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), {
    owner_uid: ownerUid,
    user_email: userEmail || "unknown",
    action,
    details,
    created_at: serverTimestamp(),
  });
}

