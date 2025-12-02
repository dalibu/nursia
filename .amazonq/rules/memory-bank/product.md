# Nursia - Expense Tracking Service

## Project Purpose
Nursia is a comprehensive household expense tracking service designed for multi-currency financial management. It provides a complete solution for families and individuals to monitor, categorize, and analyze their spending patterns across different currencies.

## Key Features

### Core Functionality
- **Multi-currency Support**: Track expenses in UAH, EUR, USD, and RUB
- **Expense Management**: Full CRUD operations for expense tracking
- **Category System**: Organized expense categorization with admin controls
- **Recipient Management**: Track payments to users and organizations
- **Detailed Reporting**: Generate filtered reports by period and currency

### User Interfaces
- **REST API**: FastAPI-based backend with comprehensive endpoints
- **React Frontend**: Modern SPA with Material-UI components
- **Telegram Bot**: Mobile-friendly bot interface for quick expense entry
- **Web Interface**: Full-featured web application for desktop use

### Security & Authentication
- **OAuth Authentication**: JWT token-based security system
- **Role-based Access**: Admin and user permission levels
- **Rate Limiting**: Protection against API abuse
- **Secure Registration**: User registration with approval workflow

### Technical Capabilities
- **Database Management**: SQLite with Alembic migrations
- **Containerization**: Docker Compose for easy deployment
- **Testing Suite**: Comprehensive test coverage with pytest
- **Configuration Management**: Environment-based settings

## Target Users

### Primary Users
- **Households**: Families tracking shared expenses and budgets
- **Individuals**: Personal finance management across multiple currencies
- **Small Groups**: Shared expense tracking for roommates or partners

### Use Cases
- **Daily Expense Tracking**: Quick entry via Telegram bot or web interface
- **Budget Analysis**: Detailed reports and spending pattern analysis
- **Multi-currency Management**: International families or frequent travelers
- **Expense Categorization**: Organized spending by categories and recipients
- **Financial Reporting**: Period-based analysis and export capabilities

## Value Proposition
Nursia eliminates the complexity of multi-currency expense tracking by providing a unified platform that works across web, mobile (Telegram), and API interfaces. It's designed for users who need more than simple expense tracking - offering detailed categorization, recipient management, and comprehensive reporting in a self-hosted solution.