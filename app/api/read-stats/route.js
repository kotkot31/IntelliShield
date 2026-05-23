import { NextResponse } from "next/server";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function GET() {
  const docRef = doc(db, "settings", "transaction_stats");
  const snap = await getDoc(docRef);
  return NextResponse.json(snap.data() || {});
}
