---
description: How to run the application and test the recent fixes
---

# Prerequisites
- Node.js & npm installed (Try `node -v` and `npm -v` to verify)

# Setup
1. Install dependencies:
```bash
npm install
```

# Running the App
1. Start the development server:
```bash
npm run dev
```
2. Open the URL shown in the terminal (usually http://localhost:8080)

# Testing the Fix
1. **Navigate to Editor**: Go to a section's "Manual Fix Editor".
2. **Create Question**: Add a new question and select "Multiple Choice" as the Answer Type.
3. **Save**: Save the question.
4. **Simulate**: Go to the "Exam Simulator" for that section.
5. **Verify**: Check that the Multiple Choice question displays its options correctly (checkboxes should appear).
6. **Submit & Review**: Submit the exam and check the "Exam Review" page to ensure the answer is displayed correctly.
