# Instruct AI - AI-Powered Fitness Class Generator

![Instruct AI Logo](https://lovable.dev/projects/8fbd802a-6455-4754-8c63-6f1c16cdb02d/logo)

Instruct AI is an intelligent fitness class generator that creates personalized workout routines using AI. The app helps fitness instructors and enthusiasts create structured, timed workout classes with warmups, main workout blocks, and cooldowns.

## Features

- **AI-Powered Workout Generation**: Create custom workouts based on your preferences
- **Interactive Timer**: Follow along with your workout with visual and audio cues
- **Save Favorite Workouts**: Store your best workouts for future use
- **Customizable Parameters**: Adjust intensity, duration, focus areas, and more
- **Past Class Learning**: The AI learns from your past classes to create better workouts

## How to Use Instruct AI

### Generating a Workout

1. **Set Your Preferences**:
   - Select your workout format (HIIT, Strength, Yoga, etc.)
   - Choose the workout duration (in minutes)
   - Set the intensity level (low, medium, high)
   - Specify body focus areas (upper, lower, full body)
   - Add any movements to avoid or special notes

2. **Generate Your Workout**:
   - Click the "Generate Workout" button
   - The AI will create a personalized workout plan with multiple blocks
   - Each workout includes a warm-up, main workout sections, and a cooldown

3. **Using the Timer**:
   - Follow along with the timer for each exercise
   - Audio cues will alert you when exercises change
   - Use the controls to pause, skip forward/backward, or reset
   - View the next exercise in advance

4. **Saving Workouts**:
   - After completing a workout, you can save it to your library
   - Access saved workouts from the "Saved Classes" tab
   - Reuse your favorite workouts anytime

### Pasting Past Classes

You can paste descriptions of your past classes to help the AI generate more personalized workouts:

1. In the workout generator, find the "Paste past classes" textarea
2. Enter each past class on a separate line
3. The AI will use these as examples when creating your new workout

## Project Info

**Live Demo**: [Instruct AI on Windsurf](https://windsurf.io/eboboc/json-flow-timer-21)

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/8fbd802a-6455-4754-8c63-6f1c16cdb02d) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone https://github.com/eboboc/json-flow-timer-21.git

# Step 2: Navigate to the project directory.
cd json-flow-timer-21

# Step 3: Install the necessary dependencies.
npm install

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

This will start the development server at http://localhost:8080/

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How to Deploy with Windsurf

Windsurf is a platform that allows you to easily deploy web applications. Here's how to deploy this project using Windsurf:

1. **Create a Windsurf Account**:
   - If you don't have one already, sign up at [windsurf.io](https://windsurf.io)

2. **Connect Your GitHub Repository**:
   - In the Windsurf dashboard, connect your GitHub account
   - Select the `json-flow-timer-21` repository

3. **Configure Deployment Settings**:
   - Framework: Select `React` or `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. **Deploy Your Application**:
   - Click on the "Deploy" button
   - Windsurf will build and deploy your application

5. **Access Your Deployed Application**:
   - Once deployment is complete, you'll receive a URL to access your application
   - The URL will be in the format: `https://windsurf.io/username/json-flow-timer-21`

## Adding Collaborators

To add collaborators to your project:

1. Go to your GitHub repository: https://github.com/eboboc/json-flow-timer-21
2. Click on "Settings" > "Collaborators"
3. Click on "Add people"
4. Enter the GitHub username (e.g., `mkhalighi-code`) and send the invitation

Once they accept the invitation, they'll have access to contribute to the repository.

## OpenAI API Key Setup

This application uses the OpenAI API for generating workouts. To set up your API key:

1. Create an account at [OpenAI](https://platform.openai.com/) if you don't have one
2. Generate an API key in your OpenAI dashboard
3. Create a `.env` file in the root directory with the following content:
   ```
   VITE_OPENAI_API_KEY=your_api_key_here
   VITE_OPENAI_MODEL=gpt-4o-mini
   ```
4. Restart the development server

Alternatively, you can enter your API key directly in the application's settings page.
