# Quiz Backend API

A comprehensive backend API for an AI-powered quiz application that enables users to create, take, and track quizzes with intelligent question generation, progress analytics, chat with AI tutor and generate quiz using RAG technique.

## Overview

This backend service provides a RESTful API for managing quizzes, topics, user authentication, and analytics. It leverages OpenAI's GPT-3.5 Turbo for intelligent quiz generation and Supabase for authentication and database management. The system supports multiple quiz types, difficulty levels, timer-based quizzes, and comprehensive progress tracking.

## Key Features

### Quiz Management
- **AI-Powered Quiz Generation**: Automatically generates multiple-choice questions using OpenAI GPT-4 Turbo based on user-provided topics and difficulty levels
- **Topic Suggestions**: AI suggests specific quiz topics from general user input (e.g., "driving license" → "Traffic Signs", "Road Safety Rules", etc.)
- **Topic Validation**: Validates that topics are specific enough for quality quiz generation
- **Multiple Difficulty Levels**: Supports BEGINNER, INTERMEDIATE, and ADVANCED difficulty levels
- **Flexible Question Count**: Generate quizzes with 1-50 questions (default: 15)
- **Optional Timer**: Set time limits for quizzes (in seconds) or create untimed quizzes
- **Quiz Organization**: Organize quizzes by topics with full CRUD operations

### Quiz Taking Experience
- **Pause and Resume**: Save quiz progress mid-attempt and resume later with all answers preserved
- **Timer Management**: Pause timer when pausing quiz, resume from exact elapsed time
- **Answer Submission**: Submit answers and receive immediate feedback with explanations
- **Score Calculation**: Automatic scoring with percentage and correct count
- **Detailed Results**: View results with correct answers, explanations, and per-question feedback

### Analytics & Progress Tracking
- **Comprehensive Dashboard Analytics**:
  - Overall statistics (total topics, quizzes, attempts, questions)
  - Performance metrics (average score, best/worst scores)
  - Time-based analytics (time spent vs. time allocated, efficiency metrics)
  - Weekly comparisons (this week vs. last week for attempts, topics, scores)
  - Topic-level progress tracking with completion percentages
  - Time-series data (last 7, 30, and 90 days) for performance graphs
- **Attempt History**: View all quiz attempts with filtering and pagination
- **Progress Tracking**: Track progress per topic with average scores and completion rates

### Authentication & Security
- **Google OAuth Integration**: Secure authentication using Supabase Auth with Google OAuth
- **JWT-based Authorization**: Bearer token authentication for all protected endpoints
- **User Isolation**: Users can only access their own quizzes, topics, and results
- **Owner Verification**: Only quiz/topic owners can edit or delete their content

### Data Management
- **Cascading Deletes**: Proper cleanup of related data when deleting topics or quizzes
- **Data Validation**: Comprehensive validation of AI-generated content (options, correct answers, explanations)
- **Answer Matching**: Intelligent matching of correct answers with fuzzy matching fallbacks
- **Status Tracking**: Track quiz attempt status (IN_PROGRESS, PAUSED, COMPLETED)

## Technology Stack

### Core Technologies
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Prisma 6.x
- **Authentication**: Supabase Auth (Google OAuth)

### AI & External Services
- **OpenAI API**: GPT-4 Turbo for quiz generation and topic suggestions
- **Supabase**: Authentication, database hosting, and connection pooling

### Development Tools
- **TypeScript**: Type-safe development
- **Jest**: Unit and integration testing
- **ESLint & Prettier**: Code quality and formatting
- **Swagger/OpenAPI**: API documentation
- **ts-node-dev**: Hot reload for development

## Project Structure

```
quiz-backend/
├── src/
│   ├── app.ts                 # Express app setup and middleware
│   ├── config/
│   │   └── swagger.ts         # Swagger/OpenAPI configuration
│   ├── middleware/
│   │   └── auth.middleware.ts # JWT authentication middleware
│   ├── modules/
│   │   ├── auth/              # Authentication routes and controllers
│   │   ├── topic/              # Topic management (CRUD)
│   │   ├── quiz/               # Quiz creation, retrieval, pause/resume
│   │   └── results/            # Analytics and result retrieval
│   ├── prisma/
│   │   └── schema.prisma      # Database schema definition
│   ├── tests/                 # Test utilities and setup
│   └── utils/
│       ├── prisma.ts          # Prisma client instance
│       └── supabase.ts        # Supabase client instance
├── scripts/
│   └── fix-existing-attempts.ts # Data migration utility
├── public/                    # Static files (OAuth callback page)
└── package.json
```

## Database Schema

### Core Models
- **User**: User accounts (linked to Supabase Auth)
- **Topic**: Quiz topics/categories
- **Quiz**: Quiz metadata (title, difficulty, timer, status)
- **Question**: Individual quiz questions with options and correct answers
- **QuizAttempt**: User attempts with status tracking (IN_PROGRESS, PAUSED, COMPLETED)
- **Answer**: User answers linked to attempts and questions
- **Explanation**: Detailed explanations for each question
- **Progress**: Topic-level progress tracking

### Key Relationships
- User → Topics → Quizzes → Questions
- User → QuizAttempts → Answers
- Questions → Explanations (one-to-one)

## API Endpoints

### Authentication
- `GET /api/v1/auth/login` - Initiate Google OAuth login
- `GET /api/v1/auth/callback` - Handle OAuth callback
- `GET /api/v1/auth/session` - Get current session
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/signout` - Sign out

### Topics
- `POST /api/v1/topic/create` - Create a new topic
- `GET /api/v1/topic/list` - List all user's topics
- `GET /api/v1/topic/:id` - Get topic details
- `PUT /api/v1/topic/:id` - Update topic
- `DELETE /api/v1/topic/:id` - Delete topic and all related data

### Quizzes
- `POST /api/v1/quiz/suggest-topic` - Get AI-suggested specific topics
- `POST /api/v1/quiz/validate-topic` - Validate topic specificity
- `POST /api/v1/quiz/create` - Generate quiz using AI
- `GET /api/v1/quiz/list/:topicId` - List quizzes for a topic
- `GET /api/v1/quiz/:id` - Get quiz (without answers)
- `POST /api/v1/quiz/:quizId/submit` - Submit answers and get results
- `POST /api/v1/quiz/:quizId/pause` - Pause quiz and save progress
- `GET /api/v1/quiz/:quizId/resume` - Resume paused quiz
- `DELETE /api/v1/quiz/:id` - Delete quiz

### Results & Analytics
- `GET /api/v1/results/quiz/:quizId` - Get latest result for a quiz
- `GET /api/v1/results/:attemptId` - Get specific attempt result
- `GET /api/v1/results` - List all user's attempts (with pagination)
- `GET /api/v1/results/analytics/me` - Comprehensive analytics dashboard data

**Full API Documentation**: Available at `/api-docs` when server is running (Swagger UI)

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (Supabase recommended)
- OpenAI API key
- Supabase project with Google OAuth configured
## Architecture & Design Decisions

### Quiz Generation Flow
1. User provides topic, difficulty, and question count
2. System validates topic specificity
3. OpenAI GPT-4 Turbo generates quiz content with strict formatting
4. Parser extracts questions, options, correct answers, and explanations
5. Validation ensures all questions have 4 options, matching correct answers, and explanations
6. Quiz saved to database with questions and explanations

### Pause/Resume Mechanism
- **Pause**: Saves current answers and elapsed time, marks attempt as PAUSED
- **Resume**: Retrieves paused attempt, pre-fills answers, resumes timer from elapsed time
- **Completion**: Updates paused attempt to COMPLETED with final scores

### Analytics Calculation
- All analytics filter by `status = COMPLETED` to exclude in-progress attempts
- Time-based comparisons use UTC to avoid timezone issues
- Time series data generated for 7, 30, and 90-day periods
- Topic progress calculated from completed quizzes per topic

### Security
- JWT tokens validated on every protected endpoint
- User ownership verified before any data modification
- Correct answers hidden until quiz submission
- Cascading deletes ensure data integrity

## Testing

The project includes unit and integration tests:
- Unit tests for controllers and utilities
- Integration tests for API endpoints
- Test coverage reporting available

Run tests with:
```bash
npm test
npm run test:watch
npm run test:coverage
```

## Upcoming Features

### Chat with AI
Integration of conversational AI to help users:
- Get explanations for quiz questions
- Ask follow-up questions about topics
- Receive personalized study recommendations
- Interactive learning assistance

### Quiz Generation from Documents (RAG)
Implementation of Retrieval-Augmented Generation (RAG) pattern to:
- Upload documents (PDFs, text files, etc.)
- Extract and index document content
- Generate context-aware quizzes from document content
- Ensure questions are based on actual document content
- Support multiple document formats and sources

This will enable users to create quizzes from their own study materials, textbooks, or any document, making the platform more versatile for personalized learning.

## Contributing

This is a private project. For questions or suggestions, please contact the maintainer.

## License

ISC

## Support

For issues or questions, please refer to the API documentation at `/api-docs` or check the codebase documentation files.

