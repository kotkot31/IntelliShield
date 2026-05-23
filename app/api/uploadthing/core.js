import { createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

const f = createUploadthing();

export const ourFileRouter = {
  csvUploader: f({
    "text/csv": {
      maxFileCount: 1,
      maxFileSize: "8MB",
    },
  })
    .middleware(async ({ files }) => {
      const file = files[0];
      const isCsvByName = file?.name?.toLowerCase().endsWith(".csv");

      if (!isCsvByName) {
        throw new UploadThingError("Only CSV files are allowed.");
      }

      return {};
    })
    .onUploadComplete(async ({ file }) => {
      return { uploadedFileUrl: file.ufsUrl };
    }),
};
