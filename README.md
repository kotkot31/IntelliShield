# Fraud Detection System - Web-Based Transaction Monitoring

A full-stack fraud detection system using machine learning for transaction monitoring, built with Next.js, Firebase, and JavaScript-based ML models.

## Features

- **Manual Model Retraining**: Trigger model retraining via dashboard button
- **Scheduled Automatic Retraining**: Daily automated model retraining via Vercel cron jobs
- **Versioned Model Storage**: Safe model updates with rollback capability
- **Real-time Fraud Detection**: ML-powered transaction scoring
- **Firebase Integration**: Authentication and Firestore for data storage

## Tech Stack

- Next.js (App Router)
- Firebase (Authentication + Firestore)
- UploadThing (File uploads)
- JavaScript-based ML (Logistic Regression)
- Tailwind CSS
- Vercel (Deployment + Cron Jobs)

## Getting Started

### Prerequisites

- Node.js installed
- Firebase project configured
- Firebase credentials in `.env.local`

### Environment Variables

Add the following to your `.env.local` file:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Cron Secret (for scheduled retraining security)
CRON_SECRET=your_secure_random_string
```

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scheduled Retraining

The system includes automatic daily model retraining via Vercel cron jobs.

### How It Works

1. **Cron Schedule**: Runs every 24 hours at midnight UTC (configured in `vercel.json`)
2. **Security**: Protected by `CRON_SECRET` environment variable
3. **Multi-User Support**: Automatically retrains models for all users with labeled data
4. **Safe Updates**: Previous model versions are preserved for rollback

### Manual Testing

To test the scheduled retraining endpoint manually:

```bash
curl -X POST http://localhost:3000/api/cron/retrain \
  -H "x-cron-secret: your_secure_random_string"
```

### Production Deployment

When deploying to Vercel:

1. Set `CRON_SECRET` in Vercel environment variables
2. Deploy the project - the cron job will be automatically configured
3. Monitor logs in Vercel dashboard for retraining results

## API Endpoints

### Manual Retraining
- **POST** `/api/train`
  - Body: `{ "ownerUid": "user_id" }`
  - Triggers manual model retraining for a specific user

### Scheduled Retraining (Cron)
- **POST** `/api/cron/retrain`
  - Headers: `x-cron-secret: your_secret` or `Authorization: Bearer your_secret`
  - Automatically retrains models for all users with labeled data
  - Called by Vercel cron job every 24 hours

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

## Deploy on Vercel

The easiest way to deploy your Next.js app is using the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
