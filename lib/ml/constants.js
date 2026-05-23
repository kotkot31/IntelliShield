export const MODEL_VERSION = "v1.0.0";
export const FEATURE_SCHEMA_VERSION = "fsv1";
export const ML_THRESHOLD = 0.65;
export const TRAIN_TEST_SPLIT = 0.8;
export const EPOCHS = 50;
export const BATCH_SIZE = 16;

// Neural Network specific constants
export const NN_EPOCHS = 100;
export const NN_BATCH_SIZE = 32;
export const NN_LEARNING_RATE = 0.005;
export const NN_HIDDEN_UNITS = [16, 8]; // Two hidden layers
export const NN_MIN_ROWS = 200;         // Minimum rows to enable NN training

export const FEATURE_NAMES = [
  "f_amount_log",
  "f_hour_norm",
  "f_is_late_night",
  "f_is_new_location",
  "f_amount_zscore",
  "f_velocity_1h",
  "f_rule_risk_norm",
  "f_anomaly_score",
  "f_network_risk",
];
