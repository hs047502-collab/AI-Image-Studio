# MD: Abdul Ahad AI Image Studio — Free + Paid Providers Update

এই আপডেটে আগের 120-style Studio, free model-গুলো, আসল Ideogram/Recraft integration এবং **Premium Auto 2K** রেখে নতুন **Google Gemini / AI Studio, Grok, Mistral, configurable Apify Actor/Task** এবং **Gallery selection + ZIP download** যোগ করা হয়েছে।

> **API key কখনও HTML/browser-এ দেবেন না।** সব paid-provider key backend-এর `.env` ফাইলে থাকবে। API credentials না থাকলেও free/community models ব্যবহারযোগ্য। Premium Auto আগের মতো default আছে, কিন্তু প্রতিটি paid/API generation-এর আগে confirmation দেখায়।

## চালু করার নিয়ম

1. Node.js 20 বা নতুন সংস্করণ ইনস্টল করুন.
2. Project folder-এ terminal খুলে চালান:

   ```bash
   npm install
   ```

3. Provider account-এ key তৈরি করুন: [Google AI Studio](https://aistudio.google.com/api-keys), [xAI Console](https://console.x.ai/), [Mistral Console](https://console.mistral.ai/), এবং [Apify account integrations](https://console.apify.com/account/integrations)। Ideogram/Recraft key-এর জন্য তাদের নিজ নিজ developer dashboard ব্যবহার করুন।
4. `.env.example` কপি করে `.env` বানান। যে provider ব্যবহার করবেন, কেবল তার key বসান। উদাহরণ:

   ```env
   IDEOGRAM_API_KEY=...
   RECRAFT_API_TOKEN=...
   GEMINI_API_KEY=...
   XAI_API_KEY=...
   MISTRAL_API_KEY=...
   ```

5. চালু করুন:

   ```bash
   npm start
   ```

6. Browser-এ খুলুন: **http://localhost:3000**

`.env` পরিবর্তনের পর server restart করুন। Status indicator-এ কোন provider key server পেয়েছে তা দেখাবে; কোনো secret key HTML-এ পাঠানো হয় না।

## কোন provider কী করে

- **Premium Auto 2K (default)** — graphic/vector/icon/line-art style-এ Recraft V4.1 Pro; photo/scene style-এ Ideogram 4.5 Quality। অন্তত একটি Ideogram/Recraft key লাগবে। দুটো key থাকলে style অনুযায়ী বেছে নেয়; একটিমাত্র থাকলে সেটি ব্যবহার করে। এই mode free model-এ চুপিসারে fallback করে না। প্রতিবার paid-use confirmation থাকে।
- **Auto Free HD ও অন্যান্য Free/community models** — FLUX, Qwen, Z-Image এবং অন্যান্য free/fallback choices আগের মতো dropdown-এ আছে। Provider availability, resolution, rate-limit ও output quality বদলাতে পারে; native 2K নিশ্চয়তা নেই।
- **Google Gemini / Google AI Studio — Nano Banana 2.1** — AI Studio থেকে Gemini API key তৈরি করে `.env`-এ `GEMINI_API_KEY` দিন। Google AI Studio ও Gemini এখানে একই backend/key; আলাদা দুটি integration নয়। UI-র resolution choice থেকে 1K, 2K বা 4K request পাঠায়। Google-এর বর্তমান plan/rate অনুযায়ী usage bill হতে পারে; generated file-এর আসল pixel size response থেকে মাপা হয়।
- **xAI Grok Imagine Image 2.0** — `.env`-এ `XAI_API_KEY` দিন। 1K/2K এবং medium-quality request পাঠানো হয়; xAI-এর বর্তমান pricing/credits প্রযোজ্য।
- **Mistral image_generation tool** — `.env`-এ `MISTRAL_API_KEY` দিন। Mistral Chat Completions-এর built-in image-generation tool ব্যবহার করে; output resolution Mistral নিয়ন্ত্রণ করে, তাই 2K guarantee নেই। Account/plan usage rules প্রযোজ্য।
- **Apify Actor/Task** — `.env`-এ `APIFY_API_TOKEN` এবং **ঠিক একটি** `APIFY_IMAGE_ACTOR_ID` অথবা `APIFY_IMAGE_TASK_ID` সেট করুন। Apify সাধারণ Actor platform—token একা কোনো নির্দিষ্ট image model বা input/output schema নির্বাচন করে না।

### Apify input template সেট করা

`.env.example`-এ একটি সাধারণ template আছে। আপনার নির্বাচিত Actor/Task-এর input schema অনুযায়ী field name বদলান। উদাহরণস্বরূপ, কোনো Actor যদি `userPrompt` এবং `numImages` চায়:

```env
APIFY_IMAGE_ACTOR_INPUT_JSON={"userPrompt":"{{prompt}}","numImages":"{{numberOfImages}}","aspectRatio":"{{aspectRatio}}"}
```

সমর্থিত placeholder: `{{prompt}}`, `{{negativePrompt}}`, `{{aspectRatio}}`, `{{numberOfImages}}`, `{{resolution}}`, `{{width}}`, `{{height}}`, `{{styleName}}`, `{{artStyle}}`, `{{detailLevel}}`। Exact `{{numberOfImages}}` placeholder number হিসেবেই পাঠানো হয়।

Apify integration Actor/Task run করে। Studio dataset-এ image URL/data এবং default key-value store-এ image-নামযুক্ত image file খোঁজে। কোনো Actor অন্য storage format ব্যবহার করলে তার input/output অনুযায়ী integration template বা parser বদলাতে হবে। Apify compute, Actor-এর নিজস্ব pricing এবং downstream API cost হতে পারে—confirmation পড়ুন এবং আগে Actor-এর pricing যাচাই করুন।

## ১২০টি Style recommendation CSV

- `STYLE-RECOMMENDATIONS-120.csv`-এ প্রতিটি style-এর জন্য একটি করে row আছে (মোট ১২০টি)। GitHub-এ সরাসরি commit/upload করার মতো UTF-8 CSV।
- Aspect ratio, resolution tier, background, color mode, detail, composition, free/paid model guidance, prompt recipe/negative prompt এবং photo/vector/coloring/3D family-specific settings রয়েছে। যেই control কোনো style-এ প্রযোজ্য নয়, সেখানে `N/A` লেখা আছে।
- CSV-র preset values Studio-র একই recommendation helper থেকে তৈরি। Style metadata বা preset বদলালে regenerate করুন: `npm run generate:style-csv`.
- `Ultra` হলো app-এর সর্বোচ্চ free resolution tier; free/community model-এ 2K নিশ্চয়তা নেই। Premium Auto paid provider-এ native 2K request করে, কিন্তু output dimensions model/aspect ratio অনুযায়ী বদলাতে পারে—download করা image-এর pixel size যাচাই করুন।
- Flat Vector / Clean Commercial Vector full-scene default ব্যবহার করে; icon/logo চাইলে CSV-তে দেওয়া `centered badge emblem framing` ও white background বিবেচনা করুন। এই style-গুলো PNG/JPG raster artwork তৈরি করে, editable SVG নয়।
- GitHub public করলে CSV দেখা যাবে; অন্যদের reuse-এর অনুমতি দিতে চাইলে আপনার পছন্দের `LICENSE` আলাদাভাবে যোগ করুন—public URL নিজে থেকে license নির্ধারণ করে না।
- Vector prompt quality fix: detailed prompt দিলেও নির্বাচিত vector style recipe আর বাদ পড়ে না। Flat-vector-এর default 4:3 + Natural background, flat color-fill, crisp edges ও Full Scene framing; style বদলালে user নিজে যে settings বদলেছেন সেগুলো অযথা overwrite হবে না।

## Image download ও Gallery

- Result view এবং প্রতিটি gallery card থেকে আগের মতো **single PNG download** করা যায়।
- Gallery card-এ **Select** টিক দিয়ে একাধিক image বেছে নিন; **Select all** এবং **Clear selection**-ও আছে।
- **Download selected ZIP** চাপলে বাছাই করা original image file-গুলো এক ZIP-এ নামবে। ZIP browser-এই তৈরি হয়; server-এ gallery image upload হয় না।
- Gallery browser-এর IndexedDB-তে সংরক্ষিত, তাই একই browser/profile-এ দেখা যায়।

## Paid request ও quality সতর্কতা

- Premium Auto 2K, Gemini, Grok, Mistral, Apify, Ideogram ও Recraft request-এর আগে paid-use confirmation আসে। Cancel করলে request পাঠানো হয় না।
- Provider pricing/credits/plan limits বদলাতে পারে। Gemini 4K, Grok 2K, Recraft Pro ও Apify Actor ব্যবহার করার আগে সংশ্লিষ্ট dashboard-এ current charge দেখুন।
- Native high resolution মানেই প্রতিটি generated image artifact-free বা perfect হবে—এমন নিশ্চয়তা নেই। Gallery-র আগের ছবিগুলো স্বয়ংক্রিয়ভাবে upscale/enhance হয় না।
- API credentials নেই এমন অবস্থায় এই build-এ provider API-তে live generation/billing test করা হয়নি। নিজের key যোগ করার পর ছোট একটি test request দিয়ে শুরু করুন।

## Server protection

Local/private use-এ `.env`-এর `STUDIO_ACCESS_KEY` খালি রাখা যায়। Public internet-এ server expose করলে একটি লম্বা random `STUDIO_ACCESS_KEY`, HTTPS, hosting-layer login, rate limits ও abuse monitoring ব্যবহার করুন। API keys-সহ server-কে open/public অবস্থায় রাখবেন না।

## Official API references

- Google AI Studio Gemini image generation: https://aistudio.google.com/docs/image-generation
- Google AI Studio API keys: https://aistudio.google.com/api-keys
- xAI Grok image generation: https://docs.x.ai/developers/model-capabilities/images/generation
- Mistral image-generation tool: https://docs.mistral.ai/studio/agents/agent-tools/image_generation
- Mistral Files API: https://docs.mistral.ai/api/endpoint/files
- Apify Actor API: https://docs.apify.com/api/v2/actors-runs-post
- Apify Task API: https://docs.apify.com/api/v2/actor-task-runs-post
- Ideogram API: https://developer.ideogram.ai/api-reference/images/generate/ideogram-4-5
- Recraft API: https://www.recraft.ai/docs/api-reference/models/recraft-v4-1


## OpenRouter Image Models

1. OpenRouter account থেকে API key তৈরি করুন।
2. Project root-এ `.env.example` কপি করে `.env` বানান।
3. `.env`-এ `OPENROUTER_API_KEY=আপনার_API_KEY` বসান (key কখনো `public/index.html`-এ দেবেন না)।
4. `npm install` এবং `npm start` চালিয়ে `http://localhost:3000` খুলুন।
5. AI Model Engine থেকে **OpenRouter • Dynamic Image Models** বেছে নিন; server API থেকে image-output সমর্থিত model তালিকা আসবে। Model ও account অনুযায়ী charge হতে পারে।

OpenRouter model list endpoint: `GET https://openrouter.ai/api/v1/models`। Image generation এই integration-এ OpenRouter Chat Completions-এর `modalities: ["image", "text"]` ব্যবহার করে। কোনো model image output না দিলে সেটি তালিকায় নাও আসতে পারে বা generation ব্যর্থ হতে পারে।
