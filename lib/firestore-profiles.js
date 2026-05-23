import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const PROFILES_COLLECTION = "user_profiles";

/**
 * Fetch existing user profiles from Firestore in bulk.
 * Firestore 'in' queries support a maximum of 30 items per chunk.
 * 
 * @param {string[]} userIds - Array of user IDs to fetch
 * @returns {Promise<Map<string, Object>>} Map of userId to profile data
 */
export async function getBulkUserProfiles(userIds) {
  const profileMap = new Map();
  if (!userIds || userIds.length === 0) return profileMap;

  // Deduplicate user IDs
  const uniqueIds = [...new Set(userIds)];
  
  // Chunk into arrays of max 30 for Firestore 'in' queries
  const chunkSize = 30;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    
    const q = query(
      collection(db, PROFILES_COLLECTION),
      where("__name__", "in", chunk)
    );
    
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => {
      profileMap.set(doc.id, doc.data());
    });
  }

  return profileMap;
}

/**
 * Batch write updated user profiles to Firestore.
 * Handles the Firestore 500 document batch write limit.
 * 
 * @param {Map<string, Object>} profilesMap - Map of userId to updated profile data
 */
export async function batchUpdateUserProfiles(profilesMap) {
  if (!profilesMap || profilesMap.size === 0) return;

  const entries = Array.from(profilesMap.entries());
  const maxBatchSize = 500;
  
  for (let i = 0; i < entries.length; i += maxBatchSize) {
    const batch = writeBatch(db);
    const chunk = entries.slice(i, i + maxBatchSize);
    
    chunk.forEach(([userId, profileData]) => {
      const docRef = doc(db, PROFILES_COLLECTION, userId);
      
      // Convert Set to Array for Firestore compatibility
      const firestoreData = { ...profileData };
      if (firestoreData.knownLocations && firestoreData.knownLocations instanceof Set) {
        firestoreData.knownLocations = Array.from(firestoreData.knownLocations);
      }
      
      batch.set(docRef, {
        ...firestoreData,
        updated_at: serverTimestamp()
      }, { merge: true }); // Use merge to prevent overwriting other fields accidentally
    });
    
    await batch.commit();
  }
}
