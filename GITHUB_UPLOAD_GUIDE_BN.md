# GitHub-এ upload করার ধাপ

1. `AI-Image-Studio-GitHub-Ready-Full.zip` download করে নতুন একটি folder-এ extract করুন। ZIP-এর ভেতরের project files সরাসরি থাকবে—`public/` এবং `scripts/` folder structure-সহ।
2. GitHub-এ **New repository** তৈরি করুন। Repository public করতে চাইলে visibility **Public** রাখুন। Empty repository তৈরি করাই সহজ; GitHub থেকে README/license যোগ করার দরকার নেই, কারণ project-এর README ইতিমধ্যে আছে।
3. Extract করা project-এর সব file ও folder (বিশেষত `.gitignore`, `README.md`, `public/`, `scripts/`, CSV, `server.js`, `package.json`, `.env.example`) repository-তে upload করে commit করুন। GitHub Desktop অথবা Git ব্যবহার করলে project folder থেকে:

   ```bash
   git init
   git add .
   git commit -m "Add 120-style AI image studio"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPOSITORY.git
   git push -u origin main
   ```

   `USERNAME` ও `REPOSITORY`-এর জায়গায় নিজের GitHub username এবং repo name দিন।

4. Public CSV link পেতে repository-তে `STYLE-RECOMMENDATIONS-120.csv` খুলে **Raw** চাপুন। Link-এর ধরন হবে:

   ```text
   https://raw.githubusercontent.com/USERNAME/REPOSITORY/main/STYLE-RECOMMENDATIONS-120.csv
   ```

## নিরাপত্তা ও deploy

- ZIP-এ `.env` বা `node_modules` নেই। `.env.example` শুধু template; আসল API key GitHub-এ কখনো upload করবেন না। `.gitignore` local `.env` ফাইল আটকাবে।
- GitHub-এ source upload করলে app নিজে থেকে live server হয় না। Live studio চালাতে Node.js host/deployment লাগবে; setup-এর জন্য `README.md` ও `README_BN.md` দেখুন।
- অন্যদের code/CSV reuse করার অনুমতি দিতে চাইলে repository-তে আপনার পছন্দের `LICENSE` যোগ করুন।
