#!/bin/bash

# Credential Rotation Script for Laundromat Affiliate Program
# This script safely rotates security credentials and migrates encrypted data

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"
BACKUP_DIR="$PROJECT_ROOT/backup"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}=== Laundromat Credential Rotation Tool ===${NC}\n"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
    exit 1
fi

# Create backup of current .env
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/.env.backup.$TIMESTAMP"
cp "$ENV_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✓ Created backup: $BACKUP_FILE${NC}"

# Function to generate secure random key
generate_key() {
    openssl rand -hex 32
}

# Read current values
source "$ENV_FILE"
OLD_JWT_SECRET="$JWT_SECRET"
OLD_ENCRYPTION_KEY="$ENCRYPTION_KEY"
OLD_SESSION_SECRET="$SESSION_SECRET"
OLD_CSRF_SECRET="$CSRF_SECRET"
OLD_DOCUSIGN_WEBHOOK_SECRET="$DOCUSIGN_WEBHOOK_SECRET"

# Generate new credentials
echo -e "\n${YELLOW}Generating new credentials...${NC}"
NEW_JWT_SECRET=$(generate_key)
NEW_ENCRYPTION_KEY=$(generate_key)
NEW_SESSION_SECRET=$(generate_key)
NEW_CSRF_SECRET=$(generate_key)
NEW_DOCUSIGN_WEBHOOK_SECRET=$(generate_key)

# Function to update .env file
update_env_value() {
    local key=$1
    local value=$2
    
    if grep -q "^${key}=" "$ENV_FILE"; then
        # Key exists, update it
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        # Key doesn't exist, add it
        echo "${key}=${value}" >> "$ENV_FILE"
    fi
}

# Update .env file with new values
echo -e "${YELLOW}Updating .env file...${NC}"
update_env_value "JWT_SECRET" "$NEW_JWT_SECRET"
update_env_value "ENCRYPTION_KEY" "$NEW_ENCRYPTION_KEY"
update_env_value "SESSION_SECRET" "$NEW_SESSION_SECRET"
update_env_value "CSRF_SECRET" "$NEW_CSRF_SECRET"
update_env_value "DOCUSIGN_WEBHOOK_SECRET" "$NEW_DOCUSIGN_WEBHOOK_SECRET"

# Remove .bak files created by sed
rm -f "$ENV_FILE.bak"

echo -e "${GREEN}✓ Updated .env file with new credentials${NC}"

# Restart application if PM2 is available
if command -v pm2 &> /dev/null; then
    echo -e "\n${YELLOW}Restarting application with PM2...${NC}"
    pm2 restart wavemax --update-env
    echo -e "${GREEN}✓ Application restarted${NC}"
else
    echo -e "${YELLOW}⚠ PM2 not found. Please restart the application manually.${NC}"
fi

echo -e "\n${GREEN}✅ All credentials have been rotated successfully!${NC}"
echo -e "\n${YELLOW}⚠️  IMPORTANT: The application has been automatically restarted with the new credentials.${NC}\n"

# Check if encryption key was changed and offer migration
if [ "$OLD_ENCRYPTION_KEY" != "$NEW_ENCRYPTION_KEY" ] && [ -n "$OLD_ENCRYPTION_KEY" ]; then
    echo -e "${YELLOW}🔄 Encrypted data migration required...${NC}"
    echo -e "The encryption key has been changed. Existing encrypted data needs to be migrated.\n"
    
    read -p "Do you want to migrate encrypted data now? (yes/no): " migrate_choice
    
    if [ "$migrate_choice" = "yes" ]; then
        echo -e "\n${YELLOW}Starting encrypted data migration...${NC}"
        node "$SCRIPT_DIR/migrate-encrypted-data.js" "$OLD_ENCRYPTION_KEY" "$NEW_ENCRYPTION_KEY"
    else
        echo -e "\n${RED}⚠️  WARNING: Encrypted data has NOT been migrated!${NC}"
        echo -e "   Affiliates will not be able to access their payment information."
        echo -e "   To migrate later, run:"
        echo -e "   ${YELLOW}node $SCRIPT_DIR/migrate-encrypted-data.js $OLD_ENCRYPTION_KEY $NEW_ENCRYPTION_KEY${NC}"
    fi
fi

echo -e "\n${YELLOW}📋 Next steps:${NC}"
echo "1. Test the application to ensure everything is working"
echo "2. Manually rotate external service credentials:"
echo "   - MongoDB password in Atlas"
echo "   - OAuth client secrets (Google, Facebook, LinkedIn)"
echo "   - Email service password"
echo "   - DocuSign integration key"
echo "   - Paygistix credentials"
echo "3. Delete the backup file once you've confirmed everything works:"
echo "   $BACKUP_FILE"

echo -e "\n${YELLOW}⚠️  Security Notes:${NC}"
echo "- Old credentials are stored in: $BACKUP_FILE"
echo "- Keep this backup secure and delete it after confirming the rotation worked"
echo "- If you need to rollback, restore from the backup file"