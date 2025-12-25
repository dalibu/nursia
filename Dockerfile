FROM python:3.11-slim

# Устанавливаем часовой пояс
ENV TZ=Europe/Berlin
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Делаем скрипт запуска исполняемым
RUN chmod +x scripts/startup.sh scripts/setup_system.py

EXPOSE 8000

CMD ["./scripts/startup.sh"]