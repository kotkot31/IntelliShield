"use client";

import { useState } from "react";
import { UploadButton } from "@uploadthing/react";
import { parseTransactionsFromCsvUrl } from "@/utils/csv-transactions";
import { storeParsedTransactions, filterExistingTransactions } from "@/lib/firestore-transactions";
import { scoreTransactions } from "@/utils/fraud-detection";
import { batchUpdateUserProfiles } from "@/lib/firestore-profiles";
import { applyMlScoring } from "@/lib/ml/pipeline";
import { useAuth } from "@/contexts/auth-context";
import { logActivity } from "@/lib/activity-logs";

export default function CsvUpload({ onUploadComplete }) {
  const { user } = useAuth();
  const userId = user?.uid || "anonymous";
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingProfiles, setIsUpdatingProfiles] = useState(false);
  const [validTransactions, setValidTransactions] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [saveResult, setSaveResult] = useState(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Upload CSV File
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Accepts a single CSV file and returns the uploaded file URL.
      </p>

      <div className="mt-4">
        <UploadButton
          endpoint="csvUploader"
          onUploadBegin={() => {
            setUploadError("");
            setUploadedUrl("");
            setValidTransactions([]);
            setInvalidRows([]);
            setSaveResult(null);
          }}
          onClientUploadComplete={async (response) => {
            const firstFile = response?.[0];
            const resolvedUrl =
              firstFile?.serverData?.uploadedFileUrl || firstFile?.ufsUrl || "";
            setUploadedUrl(resolvedUrl);

            if (!resolvedUrl) {
              setUploadError("Upload succeeded but URL is missing.");
              return;
            }

            setIsParsing(true);
            try {
              await logActivity({
                ownerUid: userId,
                userEmail: user?.email,
                action: "file_upload",
                details: {
                  uploadedFileUrl: resolvedUrl,
                  fileName: firstFile?.name || "",
                },
              });

              const result = await parseTransactionsFromCsvUrl(resolvedUrl);
              
              setIsParsing(false);
              setIsDeduplicating(true);
              
              // Deduplicate: filter out transactions that already exist in Firestore
              const newTransactions = await filterExistingTransactions(result.validTransactions);
              
              if (newTransactions.length === 0 && result.validTransactions.length > 0) {
                const dupError = "All transactions in this file have already been uploaded.";
                setUploadError(dupError);
                
                await logActivity({
                  ownerUid: userId,
                  userEmail: user?.email,
                  action: "upload_rejected_duplicate",
                  details: {
                    error: dupError,
                    uploadedFileUrl: resolvedUrl,
                  },
                }).catch(() => {}); // silently ignore log failures

                setIsDeduplicating(false);
                return;
              }
              
              setIsDeduplicating(false);
              setIsParsing(true); // Switch back to parsing state (or a generic 'processing' state) visually for scoring

              const { scoredTransactions: ruleScoredTransactions, updatedProfiles } = await scoreTransactions(
                newTransactions,
              );
              const mlResult = await applyMlScoring({
                ownerUid: "anonymous",
                transactions: ruleScoredTransactions,
              });
              const scoredTransactions = mlResult.transactions;

              setValidTransactions(scoredTransactions);
              setInvalidRows(result.invalidRows);

              await logActivity({
                ownerUid: userId,
                userEmail: user?.email,
                action: "csv_parse_complete",
                details: {
                  uploadedFileUrl: resolvedUrl,
                  validCount: scoredTransactions.length,
                  invalidCount: result.invalidRows.length,
                },
              });

              if (scoredTransactions.length > 0) {
                setIsSaving(true);
                const fraudCount = scoredTransactions.filter(
                  (t) => t.status === "Fraud",
                ).length;
                const legitimateCount = scoredTransactions.length - fraudCount;

                await logActivity({
                  ownerUid: userId,
                  userEmail: user?.email,
                  action: "detection_run",
                  details: {
                    uploadedFileUrl: resolvedUrl,
                    totalProcessed: scoredTransactions.length,
                    fraudCount,
                    legitimateCount,
                    modelVersion: mlResult.model.modelVersion,
                    mlThreshold: mlResult.model.threshold,
                    mlTrainSize: mlResult.model.trainSize,
                    mlTestSize: mlResult.model.testSize,
                  },
                });

                const dbResult = await storeParsedTransactions({
                  transactions: scoredTransactions,
                  uploadedFileUrl: resolvedUrl,
                  invalidRows: result.invalidRows,
                  ownerUid: "anonymous",
                });
                
                setIsSaving(false);
                setIsUpdatingProfiles(true);
                await batchUpdateUserProfiles(updatedProfiles);
                
                setSaveResult(dbResult);

                await logActivity({
                  ownerUid: userId,
                  userEmail: user?.email,
                  action: "firestore_save_complete",
                  details: {
                    uploadedFileUrl: resolvedUrl,
                    savedCount: dbResult.savedCount,
                    fraudCount: dbResult.fraudCount,
                    legitimateCount: dbResult.legitimateCount,
                    resultId: dbResult.resultId,
                  },
                });
                
                onUploadComplete?.();
                // Notify analytics/threat-intel pages that new data is available
                window.dispatchEvent(new CustomEvent("data-updated"));
              }
            } catch (error) {
              const errorMessage = error.message || "An unexpected error occurred.";
              const isAborted = 
                errorMessage.includes("Aborted") || 
                errorMessage.includes("Parsing Error") ||
                errorMessage.includes("Upload Rejected") ||
                errorMessage.includes("empty");
                
              setUploadedUrl(""); // prevent success banner showing alongside error
              setUploadError(
                isAborted
                  ? `🛑 ${errorMessage}`
                  : `Error: ${errorMessage}`
              );

              // Log the failure — wrapped in its own try/catch so a Firestore
              // or auth failure here cannot cause a secondary unhandled crash.
              try {
                await logActivity({
                  ownerUid: userId,
                  userEmail: user?.email,
                  action: isAborted ? "upload_rejected_invalid" : "upload_failed",
                  details: {
                    error: errorMessage,
                    isAborted,
                    uploadedFileUrl: resolvedUrl || "n/a",
                  },
                });
              } catch {
                // Logging is non-critical; silently ignore if it fails.
              }
            } finally {
              setIsParsing(false);
              setIsDeduplicating(false);
              setIsSaving(false);
              setIsUpdatingProfiles(false);
            }
          }}
          onUploadError={(error) => {
            // Reset all intermediate loading states so no spinner blocks the error
            setIsParsing(false);
            setIsDeduplicating(false);
            setIsSaving(false);
            setIsUpdatingProfiles(false);
            setUploadedUrl("");
            setUploadError(error.message || "Upload failed.");
          }}
          appearance={{
            button:
              "ut-ready:bg-blue-600 ut-ready:text-white ut-uploading:cursor-not-allowed rounded-md px-4 py-2 text-sm font-medium shadow-sm ut-ready:hover:bg-blue-700",
            allowedContent: "text-sm text-slate-500 dark:text-slate-300",
          }}
          content={{
            button({ ready }) {
              return ready ? "Select CSV File" : "Loading uploader...";
            },
            allowedContent() {
              return "Only .csv files are accepted";
            },
          }}
        />
      </div>



      {/* Error banner — rendered FIRST so it's always visible */}
      {uploadError ? (
        <div
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 cursor-pointer hover:bg-rose-100 transition-colors group relative"
          onClick={() => setUploadError("")}
          title="Click to dismiss"
        >
          <p className="text-sm text-rose-700 flex justify-between items-center font-medium">
            {uploadError}
            <span className="text-rose-400 group-hover:text-rose-600 text-xs">✕</span>
          </p>
        </div>
      ) : null}

      {uploadedUrl ? (
        <div
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 cursor-pointer hover:bg-emerald-100 transition-colors group relative"
          onClick={() => {
            setUploadedUrl("");
            setValidTransactions([]);
            setSaveResult(null);
          }}
          title="Click to dismiss"
        >
          <p className="text-sm font-medium text-emerald-700 flex justify-between items-center">
            Upload successful
            <span className="text-emerald-400 group-hover:text-emerald-600 text-xs">✕</span>
          </p>
          <p className="mt-1 break-all text-sm text-emerald-800">{uploadedUrl}</p>
        </div>
      ) : null}

      {isParsing ? (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm text-blue-700">Parsing and evaluating transactions...</p>
        </div>
      ) : null}

      {isDeduplicating ? (
        <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-sm text-yellow-700">Checking for duplicate transactions...</p>
        </div>
      ) : null}

      {isSaving ? (
        <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm text-indigo-700">
            Saving valid transactions to Firestore...
          </p>
        </div>
      ) : null}

      {isUpdatingProfiles ? (
        <div className="mt-4 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-3">
          <p className="text-sm text-fuchsia-700">
            Updating living user profiles...
          </p>
        </div>
      ) : null}

      {validTransactions.length > 0 ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Valid transactions: {validTransactions.length}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Extracted fields: transaction_id, user_id, amount, date_time,
            location, ruleRiskScore, fraudProbability, mlStatus, finalStatus
          </p>
          <pre className="mt-3 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(validTransactions.slice(0, 5), null, 2)}
          </pre>
        </div>
      ) : null}

      {invalidRows.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            Invalid rows found: {invalidRows.length}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-700">
            {invalidRows.slice(0, 5).map((item) => (
              <li key={`${item.row}-${item.issues.join("-")}`}>
                Row {item.row}: {item.issues.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {saveResult ? (
        <div 
          className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 cursor-pointer hover:bg-teal-100 transition-colors group relative"
          onClick={() => {
            setSaveResult(null);
            setValidTransactions([]);
            setUploadedUrl("");
          }}
          title="Click to dismiss"
        >
          <p className="text-sm font-medium text-teal-800 flex justify-between items-center">
            Saved to Firestore: {saveResult.savedCount} transaction(s)
            <span className="text-teal-400 group-hover:text-teal-600 text-xs">✕</span>
          </p>
          <p className="mt-1 text-xs text-teal-700">
            Fraud: {saveResult.fraudCount} | Legitimate:{" "}
            {saveResult.legitimateCount}
          </p>
          <p className="mt-1 text-xs text-teal-700">
            Result summary document ID: {saveResult.resultId}
          </p>
        </div>
      ) : null}

      {/* Error banner removed from here — rendered above instead */}
    </section>
  );
}
