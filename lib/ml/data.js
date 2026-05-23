import { getTrainingData } from "@/lib/ml/training-data";
import { buildFeatureRows, buildNormalization, applyNormalization } from "@/lib/ml/feature-engineering";

export async function getModelTrainingDataset({ ownerUid, maxRows = 2000 } = {}) {
  const result = await getTrainingData({ ownerUid, maxRows });
  const rows = result.rows || [];

  // Build raw feature vectors using the standardized feature engineering pipeline
  const featureRows = buildFeatureRows(rows);
  const normalization = buildNormalization(featureRows);
  const normalizedRows = applyNormalization(featureRows, normalization);

  const samples = normalizedRows.map((row) => ({
    id: row.id,
    x: row.normalized,
    y: row.label,
  }));

  return {
    samples,
    normalization,
    validCount: samples.length,
    invalidCount: result.invalidCount || 0,
    totalFetched: result.totalFetched || 0,
  };
}

