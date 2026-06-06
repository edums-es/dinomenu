FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps && \
    npm install ajv@^8 --save-dev --legacy-peer-deps

COPY . .

ARG REACT_APP_BACKEND_URL=http://localhost:8001
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Increase Node heap to 4 GB, disable source maps to cut RAM usage in half
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV GENERATE_SOURCEMAP=false
ENV CI=false

RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
