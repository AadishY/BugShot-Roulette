# Production Dockerfile for Bugshot-Roulette Server on Hugging Face Spaces
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Expose Hugging Face Spaces standard port
EXPOSE 7860

# Production environment variables
ENV PORT=7860
ENV NODE_ENV=production

# Run the server
CMD [ "node", "index.js" ]
