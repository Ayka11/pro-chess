# Azure Deployment — Required GitHub Secrets

Add these secrets in your repository under **Settings → Secrets and variables → Actions**.

## Required

| Secret name                          | Where to get it                                                                                      |
|--------------------------------------|------------------------------------------------------------------------------------------------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN`    | Azure Portal → your Static Web App → **Manage deployment token** (Overview blade)                   |

## How to create the Azure Static Web App

1. Go to [portal.azure.com](https://portal.azure.com)
2. Create a new **Static Web App** resource
3. Choose **Other** as the deployment source (GitHub Actions will handle it)
4. After creation, copy the **Deployment token** and add it as the secret above

## Workflow triggers

| Event                     | Action                                  |
|---------------------------|-----------------------------------------|
| Push to `main` / `master` | Build + deploy to production            |
| Pull request opened/updated | Build + deploy to preview environment |
| Pull request closed       | Tear down preview environment           |
