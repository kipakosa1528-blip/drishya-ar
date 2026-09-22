# Deployment Rules for Kipakosa AR

## Production Deployment Protocol
1. **Always use Vercel CLI directly**:
   - Run `vercel --prod --yes` (or `npm run deploy`) to deploy to `https://kipakosa.vercel.app`.
   - **NEVER** rely on or wait for GitHub push webhooks to deploy to Vercel. GitHub auto-deployments are not linked.
2. **Oracle VM Sync**:
   - Run `git push origin main`
   - Run `ssh -i "<key>" ubuntu@144.24.110.233 "cd /home/ubuntu/app && git pull origin main && pm2 reload kipakosa"`
3. **Always verify live**:
   - Verify `https://kipakosa.vercel.app` after every deployment.
