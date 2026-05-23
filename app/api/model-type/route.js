import { NextResponse } from "next/server";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

const SETTINGS_REF = () => doc(db, "settings", "ml");

export async function GET() {
  try {
    const snap = await getDoc(SETTINGS_REF());
    const activeModelType = snap.exists() ? (snap.data().activeModelType || "logistic") : "logistic";
    return NextResponse.json({ success: true, activeModelType });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to read model type." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { modelType } = body;

    if (!["logistic", "neural"].includes(modelType)) {
      return NextResponse.json(
        { success: false, message: "Invalid modelType. Must be 'logistic' or 'neural'." },
        { status: 400 },
      );
    }

    await setDoc(SETTINGS_REF(), { activeModelType: modelType, updated_at: serverTimestamp() }, { merge: true });

    return NextResponse.json({ success: true, activeModelType: modelType });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update model type." },
      { status: 500 },
    );
  }
}
