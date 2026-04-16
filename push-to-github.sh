#!/bin/bash
# Dari CRM — Push to GitHub
# Run this once from your terminal: bash ~/crm-auto-algerie/push-to-github.sh

set -e
cd "$(dirname "$0")"

echo "📦 Cleaning stale git lock..."
rm -f .git/index.lock

echo "🔧 Configuring git identity..."
git config user.email "akrambrk12@gmail.com"
git config user.name "Akram"

echo "📝 Staging all files..."
git add .

echo "💾 Committing..."
git commit -m "Initial commit - Dari CRM" || echo "(nothing new to commit, using existing commit)"

echo "🔗 Adding GitHub remote..."
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/Akram7558/dari-crm.git

echo "🚀 Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ Done! Code pushed to https://github.com/Akram7558/dari-crm"
echo ""
echo "Next step: go to https://vercel.com/new and import the dari-crm repository."
echo "Add these environment variables in Vercel:"
echo "  NEXT_PUBLIC_SUPABASE_URL=https://mcuvhlqyohcbqdicqnxr.supabase.co"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdXZobHF5b2hjYnFkaWNxbnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjM1NDIsImV4cCI6MjA5MTkzOTU0Mn0.HcBJpiVBWm8WyDWvLbrEQMssdnTTVCr9mtVYsG0C0E8"
