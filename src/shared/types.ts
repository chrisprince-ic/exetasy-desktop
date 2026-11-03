export type ExamMode = "exam" | "lab" | "interview";

export type QuestionType = "mc" | "sa" | "la" | "coding";

export interface MCQuestion {
  id: number;
  type: "mc";
  marks: number;
  text: string;
  options: string[];
  correct: number;
  explanation?: string;
}

export interface SAQuestion {
  id: number;
  type: "sa";
  marks: number;
  text: string;
  placeholder?: string;
  modelAnswer?: string;
}

export interface LAQuestion {
  id: number;
  type: "la";
  marks: number;
  text: string;
  placeholder?: string;
  modelAnswer?: string;
}

export type ExamQuestion = MCQuestion | SAQuestion | LAQuestion;

export interface DemoSession {
  id: string;
  mode: ExamMode;
  course: string;
  score: number;
  date: string;
  duration: string;
  status: "completed" | "in-progress";
}

export interface LabProblem {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  marks: number;
  tags: string[];
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  starterCode: Record<string, string>;
  testCases: {
    id: number;
    visible: boolean;
    input: string;
    expected: string;
  }[];
}

export interface InterviewQuestion {
  id: string;
  type: "behavioral" | "technical";
  question: string;
  followUp?: string;
  timeLimitSec: number;
}

export interface Flashcard {
  id: number;
  front: string;
  back: string;
}
