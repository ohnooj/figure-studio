APP_DIR := app

.PHONY: check check-frontend check-backend check-security fix audit-size

check:
	cd $(APP_DIR) && npm run check

check-frontend:
	cd $(APP_DIR) && npm run check:frontend

check-backend:
	cd $(APP_DIR) && npm run check:backend

check-security:
	cd $(APP_DIR) && npm run check:security

fix:
	cd $(APP_DIR) && npm run fix

audit-size:
	cd $(APP_DIR) && npm run audit:size
