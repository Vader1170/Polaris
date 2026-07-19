# Polaris — Research Navigator

Polaris helps ambitious students navigate the unfamiliar terrain of real research — from a first spark of curiosity to a publishable idea. The Research Navigator is an AI-powered system designed to analyze interests, available time, current skills, and academic ambitions to synthesize a tailored, rigorous scientific research roadmap.

---

## Architecture Overview

To protect your credentials and prevent exposing your **Google Gemini API Key** inside the frontend code, Polaris implements a secure, professional serverless architecture:

```
                  ┌────────────────────────────────────────┐
                  │              GitHub Pages              │
                  │      (Vanilla JS Frontend Client)      │
                  └───────────────────┬────────────────────┘
                                      │
                                      │ POST /api/generate-roadmap
                                      ▼
                  ┌────────────────────────────────────────┐
                  │           Cloudflare Worker            │
                  │   (Securely stores GEMINI_API_KEY)     │
                  └───────────────────┬────────────────────┘
                                      │
                                      │ Secure REST Call with API Key
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       Google Gemini 2.5 Flash API       │
                  │     (Synthesizes Structured JSON)      │
                  └────────────────────────────────────────┘
```

During local development and testing within AI Studio, Polaris runs a lightweight **Express + Vite Node server** that proxies requests to Gemini using local environment variables, matching the production behavior identically.

---

## Complete Deployment & Configuration Guide

Follow these step-by-step instructions to configure, test, and deploy Polaris to production.

### Step 1: Create a Google AI Studio API Key
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API Key** in the top-left sidebar.
4. Click **Create API Key** and select either a new project or an existing Google Cloud project.
5. Copy your generated API Key and save it securely.

### Step 2: Set Up and Deploy the Cloudflare Worker
The serverless proxy code is located in `worker.js` at the root of this project.

#### Option A: Deployment via Cloudflare Dashboard (No CLI)
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left-hand menu, navigate to **Workers & Pages** -> **Overview**.
3. Click **Create Application**, then **Create Worker**.
4. Name your worker (e.g., `polaris-navigator-api`) and click **Deploy**.
5. Once deployed, click **Edit Code** to open the web editor.
6. Copy the entire contents of `worker.js` from this project and paste it into the Cloudflare web editor.
7. Click **Save and Deploy**.
8. Go back to your Worker's settings page: **Settings** -> **Variables**.
9. Scroll down to **Environment Variables** and click **Add variable**.
10. Name the variable `GEMINI_API_KEY`, select **Encrypt** (Secret), paste your Google AI Studio API key as the value, and click **Save**.

#### Option B: Deployment via Wrangler (Cloudflare CLI)
If you have Node.js and Wrangler installed:
1. In your project root, initialize a wrangler configuration if you haven't:
   ```bash
   npx wrangler init
   ```
2. Deploy the worker directly using Wrangler:
   ```bash
   npx wrangler deploy worker.js --name polaris-navigator-api
   ```
3. Add the secure secret key:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```
   *Enter your Google AI Studio API Key when prompted.*

### Step 3: Connect the Frontend to Your Worker
Once your Cloudflare Worker is successfully deployed, copy its public URL (e.g., `https://polaris-navigator-api.your-subdomain.workers.dev`).

1. Open `script.js` in your text editor.
2. Locate the `API_CONFIG` object at the very top (lines 11-15):
   ```javascript
   const API_CONFIG = {
     url: "/api/generate-roadmap", // Replace this string with your Cloudflare Worker URL
     apiKey: "",                   
     model: "gemini-2.5-flash"     
   };
   ```
3. Update the `url` property to your new Cloudflare Worker URL:
   ```javascript
   const API_CONFIG = {
     url: "https://polaris-navigator-api.your-subdomain.workers.dev", // Your Worker URL
     apiKey: "",                   
     model: "gemini-2.5-flash"     
   };
   ```
4. Save the file.

### Step 4: Test the Website Locally
To verify everything is working locally in your development workspace:

1. Create a `.env` file at the root of the project:
   ```bash
   touch .env
   ```
2. Add your Google AI Studio API key to `.env`:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```
3. Install base dependencies and launch the Express + Vite local development server:
   ```bash
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.
5. Navigate to the **Research Navigator** section, complete the questionnaire, and press **Generate My Roadmap**.
6. The frontend will communicate with the local Express endpoint `/api/generate-roadmap`, retrieve the generated JSON, and render the beautiful, interactive research cards.

### Step 5: Deploy the Frontend to GitHub Pages
GitHub Pages serves static sites for free. Because your Google API Key is securely encapsulated inside the Cloudflare Worker, you can safely host the entire front-end on a public GitHub repository.

1. Create a new repository on GitHub (e.g., `polaris-research`).
2. Initialize your local directory as a git repository, commit files, and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initialize Polaris with functional AI Research Navigator"
   git branch -M main
   git remote add origin https://github.com/your-username/polaris-research.git
   git push -u origin main
   ```
3. On GitHub, navigate to your repository's **Settings** tab.
4. In the left-hand menu, under the **Code and automation** section, click **Pages**.
5. Under **Build and deployment**, set the source to **Deploy from a branch**.
6. Select your **main** branch and the root directory (`/`), then click **Save**.
7. Within 1-2 minutes, GitHub will publish your site. You will find the live link at the top of the Pages settings screen (e.g., `https://your-username.github.io/polaris-research/`).

---

## Key Features Implemented

- **Secure API Proxying**: No API keys are visible to the browser or in the repository.
- **Structured JSON Schema Constraints**: Ensures that the Gemini 2.5 Flash AI model always returns perfectly formatted properties matching our frontend expectations.
- **Interactive, Collapsible Interface**: Every generated roadmap section becomes an individual, high-contrast card that can be collapsed or expanded dynamically on click, reducing visual clutter.
- **Educator & Mentor System Prompt**: Calibrates Gemini to analyze student profiles rigorously and provide real, actionable, domain-specific advice, textbooks, and experiments.
- **Automatic Retries & Abort Timeouts**: Includes a robust fetching system that retries queries automatically on exponential backoff if transient errors occur, ensuring a resilient user experience.
