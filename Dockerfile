FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 3001

# Command
CMD ["node", "dist/main.js"]