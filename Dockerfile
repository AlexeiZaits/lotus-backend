# Используем официальный образ для Node.js
FROM node:18

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY lotus-backend/package.json lotus-backend/package-lock.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код проекта
COPY lotus-backend/ ./

# Открываем порт, на котором будет работать бэкенд
EXPOSE 9998

# Запускаем приложение
CMD ["npm", "run", "start"]