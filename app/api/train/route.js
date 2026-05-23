import { NextResponse } from "next/server";
import { applyMlScoring } from "@/lib/ml/pipeline";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { checkRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(request) {
  // ── Rate limiting: 1 call per 60 seconds per IP ──────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rl = checkRateLimit(`train:${ip}`, { maxCalls: 1, windowMs: 60_000 });

  if (!rl.allowed) {
    const retryAfterSeconds = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json(
      {
        success: false,
        rateLimited: true,
        message: `Rate limit exceeded. You can retrain once per minute. Try again in ${retryAfterSeconds}s.`,
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": "1",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil((Date.now() + rl.retryAfterMs) / 1000)),
        },
      },
    );
  }

  // ── Normal training flow ──────────────────────────────────────────────────
  try {
    const body = await request.json();
    const modelType = ["logistic", "neural"].includes(body?.modelType)
      ? body.modelType
      : "logistic";

    const q = query(collection(db, "transactions"), limit(3000));
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (transactions.length === 0) {
      return NextResponse.json(
        { success: false, message: "No transactions found for retraining.", trainingSize: 0 },
        { status: 400 },
      );
    }

    const result = await applyMlScoring({
      ownerUid: "anonymous",
      transactions,
      modelType,
      historicalTransactions: transactions, // Eliminates the double-fetch inside pipeline
    });

    const model = result.model;

    if (model.skipped) {
      return NextResponse.json({
        success: true,
        skipped: true,
        modelType,
        message: model.skipReason || `Training skipped for ${modelType} model.`,
        trainingSize: model.trainSize || transactions.length,
      });
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      modelType,
      message: `${modelType === "neural" ? "Neural Network" : "Logistic Regression"} retraining completed.`,
      version: model.modelVersion,
      trainedAt: new Date().toISOString(),
      trainingSize: model.trainSize,
      testSize: model.testSize,
      metrics: model.metrics,
    });
  } catch (error) {
    console.error("Training error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Model retraining failed.", error: error?.message },
      { status: 500 },
    );
  }
}
