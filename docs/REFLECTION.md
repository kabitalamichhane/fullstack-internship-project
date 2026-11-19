# Individual Reflection

**Name:** Kabita Lamichhane 
**Track:** Full-Stack Development  
**Projects:** FS-01 Multi-Vendor Marketplace and FS-03 Learning Management System

## What I worked on

Working on these two projects helped me see how many parts have to come together to make a full-stack application. The marketplace brings together customers, vendors, products, orders and payments. The LMS has a different set of needs, including courses, lessons, quizzes, video processing and live classes. Looking through and working with both codebases gave me a better understanding of how the React pages connect to the API and how the API uses the database and other services.

## What I learned

I learned that building a feature is about more than making its screen look right. For example, adding a product or course also involves storing the data, checking who is allowed to make changes, and handling what happens when something goes wrong. I also got more familiar with tools and ideas used across the projects, including React and TypeScript, Express, PostgreSQL and Prisma, Redis, payment flows, and background jobs.

The video lessons in the LMS especially helped me understand why long-running work should happen in the background. Uploading a video, converting it with FFmpeg, and making it available for playback are separate steps. Keeping those steps separate makes the application easier to manage.

## Challenges

One challenge was getting the full LMS running locally. I could open the frontend, but it could not load course data because the API depends on the database being available. The project is set up to use Docker for those services, but Docker could not be installed on this computer without administrator access. At first, the browser message looked like a general connection problem. I learned to check which part of the application was actually unavailable: the page was running, but the API was not.

## What I would do differently

Next time, I would plan the setup work earlier and get the database and other required services running before spending too long on the screens. I would test one complete flow at a time, from the frontend through the API and database, instead of waiting until several features are finished. I would also capture screenshots and record test results as I go, so the final submission is easier to prepare.

## Results

The projects have code and documentation for the main features in both briefs. My next step is to run the applications with their required services, verify the important flows, and add real test results and demo screenshots before submission.
