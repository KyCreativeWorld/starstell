# Google Drive setup (one time, for whoever deploys Starstell)

Starstell saves audit results to Google Drive. For that, Google needs to know the app exists. You set this up **once**. Everyone who uses the app then only clicks "Sign in with Google".

The app uses the narrowest Drive permission (`drive.file`): it can only see files it created and folders a user picks with Google's folder picker. Because of that, Google does not require an app review.

Google renames Console menus from time to time. If a label below doesn't match, look for the closest one.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in.
2. Create a new project (for example "Starstell").

## 2. Turn on the two APIs

In **APIs & Services → Library**, enable:

- **Google Drive API**
- **Google Picker API**

## 3. Set up the sign-in screen

In **Google Auth Platform** (older name: **OAuth consent screen**):

1. **Branding:** app name "Starstell", plus your support email.
2. **Audience:** choose **External** and leave it in **Testing**. Under **Test users**, add the Google account of everyone who will use the app (up to 100).
3. **Data access:** add the scope `https://www.googleapis.com/auth/drive.file`.

While the app is in Testing, only the test users can sign in. Google will show them an "unverified app" notice, which they can click through. To let anyone sign in, publish the app later. With only `drive.file`, publishing does not need a security review.

## 4. Create the OAuth client ID

In **APIs & Services → Credentials → Create credentials → OAuth client ID**:

- **Application type:** Web application
- **Authorized JavaScript origins:**
  - `https://kycreativeworld.github.io`
  - `http://localhost:8081` (for `npm run web` during development)
- **Redirect URIs:** leave empty.

Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## 5. Create an API key for the folder picker

In **Credentials → Create credentials → API key**, then edit the key:

- **Application restrictions:** Websites, with `https://kycreativeworld.github.io/*` and `http://localhost:8081/*`.
- **API restrictions:** Restrict key, then select **Google Picker API** only.

Copy the key.

## 6. Find the project number

In **IAM & Admin → Settings** (or on the project dashboard), copy the **Project number**. It is all digits, and it is not the project ID.

## 7. Put the three values in the app

Open `src/audit/googleConfig.ts` and fill in:

```ts
export const GOOGLE_CONFIG = {
  clientId: '…apps.googleusercontent.com',
  apiKey: 'AIza…',
  appId: '123456789012',
};
```

These values are not secrets. The client ID and project number are public by design, and the API key is locked to your site and the Picker API. They are safe to commit.

Rebuild (`npm run build:html`) and push.

## 8. Choose the folder in the app (each user, once)

In Starstell, go to **Settings → Report data → Choose in Google Drive** and pick the folder. That saves it as the data folder and lets Starstell write into it. Each audit then creates a new subfolder there with:

- `phase_1_output.json`: the Phase 1 timelines and task records.
- `phase_1_run_log.json`: which files were used or skipped, the model, and token usage.

If the model's reply isn't valid JSON, the app saves `phase_1_output_raw.txt` instead of `phase_1_output.json`.

A folder pasted as a link without being picked can't be written to: the app will say so and point back to this button.
