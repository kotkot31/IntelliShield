import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentModel } from "@/lib/ml/model-store";

/**
 * Fallback: read the most recent document from the ml_models collection.
 * The CSV upload pipeline saves model metadata here via saveModelMetadata,
 * but does NOT write to models/latest (which getCurrentModel reads).
 * This ensures Model Analytics shows data after the first CSV upload.
 */
async function getLatestMlModel() {
  try {
    const q = query(
      collection(db, "ml_models"),
      orderBy("created_at", "desc"),
      limit(1),
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    return {
      version: data.modelVersion || null,
      trainedAt: data.created_at?.toDate?.()?.toISOString?.() || null,
      trainingSize: (data.trainSize || 0) + (data.testSize || 0),
      retrainType: data.retrainType || "csv_upload",
      hasPrevious: false,
      previousVersion: null,
      metrics: data.metrics || null,
      threshold: data.threshold || null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Try the models/latest document first (written by manual retrain)
    let modelInfo = await getCurrentModel();

    // Fall back to ml_models collection (written by CSV upload pipeline)
    if (!modelInfo || !modelInfo.version) {
      const fallback = await getLatestMlModel();
      if (fallback) {
        modelInfo = fallback;
      }
    }

    return NextResponse.json({
      success: true,
      model: modelInfo,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to fetch model information",
      },
      { status: 500 },
    );
  }
}
