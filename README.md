# Bolsillo

A do-it-yourself pocket recorder ("bolsillo" is Spanish for "pocket"): press the iPhone's Action Button, record a conversation, and a few minutes later a Google Doc with a summary and a full transcript appears in Google Drive, ready to search from Claude.

```
iPhone (Shortcut)
  ├─ POST /api/start      → upload URL
  ├─ PUT  audio           → straight to Drive: Bolsillo/_entrantes
  └─ POST /api/process    → Vercel hands the audio to AssemblyAI
                              ↓ (webhook when transcription is done)
                            /api/webhook → Claude summarizes → Google Doc in Bolsillo/
                                         → deletes the audio and the AssemblyAI transcript
```

- **Only text is kept.** The audio is deleted once the Doc exists. If something fails, the audio stays in `_entrantes` (Spanish for "incoming") and an `⚠️ Error` Doc appears in the folder.
- **Minimal Drive permission** (`drive.file`): the app can only see the files it created itself.
- **Speaker labels:** AssemblyAI separates speakers, and Claude replaces a label with a name only when the conversation makes it clear who is speaking.
- **Notes in the conversation's language.** The summary is written in whatever language was mainly spoken.
- **Estimated cost:** about $0.26 per recorded hour. AssemblyAI charges $0.23/h (with $50 of starting credit), and Claude Haiku 4.5 accounts for the rest, depending on length.

## Setup

### 1. Variables

```bash
npm install
```

```bash
npm run setup
```

This creates `.env.local`, including a random `BOLSILLO_SECRET`. Fill in:

- `ASSEMBLYAI_API_KEY`: [assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys)
- `ANTHROPIC_API_KEY`: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

### 2. Google Drive

In [console.cloud.google.com](https://console.cloud.google.com), signed in with the Google account where you want to keep the notes:

1. Create a project called `Bolsillo`.
2. Search for **Google Drive API** and enable it.
3. Go to **Google Auth Platform** and set it up as **External**.
4. Under **Audience**, click **Publish app**. If it stays in testing mode, the permission expires after 7 days and everything stops working.
5. Under **Clients**, create a **Desktop app** client and copy its ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Google also asks for an app name, a homepage and a privacy policy before publishing. The deployed app serves both pages: `/` and `/privacy.html`.

Then authorize. Google will show "app not verified": it is your own app, so go through **Advanced → Go to Bolsillo**.

```bash
npm run google-auth
```

### 3. Deploy

```bash
vercel login
```

```bash
vercel --prod --yes
```

Copy the production URL into `PUBLIC_URL` in `.env.local`, then publish with the variables:

```bash
npm run push-env
```

```bash
vercel --prod
```

### 4. Test

```bash
npm run e2e -- path/to/audio.m4a
```

A Doc should appear in the `Bolsillo` folder in Drive within a couple of minutes.

## The iPhone Shortcut

In the **Shortcuts** app, create one called **Bolsillo** with these actions, in order. `YOUR_URL` is your `PUBLIC_URL`, and `YOUR_KEY` is the `BOLSILLO_SECRET` from `.env.local`.

| # | Action | Settings |
|---|--------|----------|
| 1 | **Record Audio** | Start Recording: *Immediately*. Finish Recording: *On Tap*. |
| 2 | **Save File** | Recorded Audio → an iCloud Drive folder. "Ask Where to Save": off. This is the backup if there is no signal. |
| 3 | **Get Contents of URL** | `YOUR_URL/api/start`. Method POST. Header `Authorization` = `Bearer YOUR_KEY`. |
| 4 | **Get Dictionary Value** | Key `upload_url`, from the result of step 3. |
| 5 | **Get Contents of URL** | URL = Dictionary Value from step 4. Method PUT. Header `Content-Type` = `audio/mp4`. Request Body: *File* → Recorded Audio. |
| 6 | **Get Dictionary Value** | Key `id`, from the result of step 5. |
| 7 | **Get Contents of URL** | `YOUR_URL/api/process`. Method POST. Header `Authorization` = `Bearer YOUR_KEY`. Request Body: *JSON*, field `file_id` = Dictionary Value from step 6. |
| 8 | **Delete Files** | Saved File from step 2. "Delete Immediately": on. |
| 9 | **Show Notification** | "Recording sent". |

If the Shortcut asks for permission to delete the file at the end, turn on **Settings → Apps → Shortcuts → Advanced → Allow Deleting Without Confirmation**.

Assign it to the button: **Settings → Action Button → Shortcut → Bolsillo**. The Action Button exists only on iPhone 15 Pro and later; on other models use **Settings → Accessibility → Touch → Back Tap**.

The notification only means the Shortcut finished; the Doc in Drive is what confirms a recording was processed. Before relying on it, make a long recording with the screen locked and check that it comes through complete.

## Asking Claude

With the Google Drive connector enabled in Claude:

> Search my Bolsillo folder: someone recommended a company that makes adhesive patches. Who was it and what did they say?

> Go through my recent conversations with advisors. Where do they agree, and where have they given me opposite advice?

> I'm meeting him again tomorrow. Remind me what we agreed on, what I promised to send, and what is still open.

## If something fails

Look in Drive for an `⚠️ Error` Doc: it says which step failed and gives the audio file's ID. To retry:

```bash
curl -X POST "$PUBLIC_URL/api/process" -H "Authorization: Bearer $BOLSILLO_SECRET" -H "Content-Type: application/json" -d '{"file_id":"AUDIO_FILE_ID"}'
```

## Development

```bash
npm test
```
