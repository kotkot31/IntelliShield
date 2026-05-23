# System Architecture & Functional Overview
**Fraud Detection & Monitoring Application**

This document provides a comprehensive, top-down breakdown of the application's functionality, designed to be used in the **Methods** or **System Architecture** section of an IMRAD (Introduction, Methods, Results, and Discussion) research presentation.

---

## 1. High-Level Architecture (Top-Down)

The system is a real-time, cloud-native web application built to ingest, analyze, and monitor financial transactions for fraudulent activity. It utilizes a modern tech stack comprising **Next.js (React)** for the frontend interface and **Google Firebase** for backend services (Authentication, Firestore Database, and Server-Side Aggregation).

### Core Tiers:
1. **Presentation Layer (Frontend)**: A responsive, role-based dashboard providing real-time analytics, data tables, and interactive data visualizations.
2. **Business Logic Layer (Rule Engine & ML Integration)**: The processing engine that parses raw data, scores risk using predefined heuristics, and assigns fraud probabilities.
3. **Data Layer (Backend)**: A NoSQL cloud database (Firestore) that securely stores user profiles, granular transaction data, and globally aggregated statistical metadata.

---

## 2. Core Functional Modules

### A. Role-Based Access Control (RBAC) & Authentication
Security and data privacy are enforced at the root level.
* **Authentication Provider**: Firebase Auth handles secure user sign-ins.
* **Tiered Authorization**: Users are assigned specific roles (`Admin`, `Asst Admin`, `IT Security`).
* **Enforcement**: Access is strictly enforced via Firestore Security Rules. For example, only Admins can delete datasets or retrain the machine learning model, while IT Security can upload data and view read-only logs.

### B. Data Ingestion Pipeline (CSV Processing)
The application allows bulk ingestion of raw transactional data.
* **Client-Side Parsing**: Uses `PapaParse` to parse large CSV files directly in the browser, minimizing server payload overhead.
* **Schema Validation**: Ensures all required fields (`transaction_id`, `user_id`, `amount`, `location`, `date_time`) are present and properly formatted.
* **Deduplication Engine**: Verifies transaction IDs against the database to prevent duplicate entries from skewing the statistical dataset.

### C. Hybrid Fraud Detection Engine
Transactions are evaluated the moment they are uploaded using a hybrid approach:
1. **Deterministic Rule-Based Scoring**: 
   * *Velocity Checks*: Detects high-frequency transactions from a single user within short timeframes.
   * *Impossible Travel*: Flags transactions originating from geographically distant locations occurring faster than physical travel permits.
   * *Thresholds*: Flags unusually high transaction amounts.
2. **Machine Learning (ML) Integration**: Evaluates transactions against a dynamic threshold (configurable by Admins) to generate a "Fraud Probability" score, classifying transactions as `Legitimate`, `Review`, or `Fraud`.

### D. Server-Side Aggregation (Analytics Core)
To ensure the dashboard loads instantly regardless of dataset size (e.g., millions of rows), the system utilizes an advanced aggregation architecture.
* **Atomic Counters**: Instead of querying the entire database to count fraud cases (which exhausts quotas and slows down performance), the system maintains a central "Scoreboard" metadata document.
* **Event-Driven Updates**: Whenever a batch of transactions is successfully uploaded or deleted, the system executes atomic `increment()` functions on the server.
* **O(1) Dashboard Loads**: The frontend simply reads the metadata document once, resulting in instantaneous rendering of the "Total Transactions", "Legitimate", and "Fraud" metrics.

### E. Observability & Dashboarding
The primary user interface for administrators and security personnel.
* **Global Metrics**: High-level statistical cards showing overall dataset health.
* **Fraud Alerts Table**: A dedicated, filtered view prioritizing high-risk transactions.
* **Cursor-Based Pagination**: Employs pointer-based data fetching to allow users to smoothly navigate through thousands of records without degrading browser memory or database read limits.
* **Audit Trail**: Logs significant system events (e.g., file uploads, configuration changes) with user attribution and timestamps.

---

## 3. Workflow Diagram (Data Lifecycle)

1. **Upload**: User securely logs in and uploads a `.csv` batch file.
2. **Parse & Validate**: System cleans the data and drops malformed/duplicate rows.
3. **Analyze**: The Hybrid Engine scans each row, calculates risk scores, and flags anomalies.
4. **Commit**: Processed rows are written to the NoSQL database in optimized chunks.
5. **Aggregate**: The server-side metadata scoreboard increments the global totals.
6. **Visualize**: The dashboard live-updates to reflect the newly detected fraud cases and legitimate volumes.
