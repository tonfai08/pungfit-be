# ========== Stage 1: Build & Setup ==========
FROM node:20-alpine

# สร้างโฟลเดอร์ทำงาน
WORKDIR /app

# คัดลอกไฟล์ package.json
COPY package*.json ./

# ติดตั้ง dependencies (เฉพาะ production)
RUN npm ci --omit=dev

# คัดลอกซอร์สทั้งหมด
COPY . .

# ตั้งค่าพอร์ตและ environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# รันแอป (ต้องมี "start": "node app.js" ใน package.json)
CMD ["npm", "start"]
