/* Shared renderer types + the typed window.exee bridge. */

export type MaterialKind = "pdf" | "docx" | "text";
export type ExtractMethod = "text-layer" | "ocr" | "none";

export interface SessionIdentity {
  email?: string;
  name?: string;
  pictureUrl?: string;
}

export interface SessionState {
  status: "disconnected" | "connecting" | "connected" | "reauth_required";
  sharing: boolean;
  profileId?: string;
  profileLabel?: string;
  identity?: SessionIdentity;
  error?: { code: string; message: string };
}

export interface ChatGPTModel {
  slug: string;
  displayName: string;
}

export type ExamQuestion =
  | {
      id: number;
      type: "mc";
      marks: number;
      text: string;
      options: string[];
      correct: number;
      explanation?: string;
      topic?: string;
    }
  | {
      id: number;
      type: "sa" | "la";
      marks: number;
      text: string;
      modelAnswer?: string;
      explanation?: string;
      topic?: string;
    };

export interface Course {
  id: string;
  name: string;
  code?: string;
  professor?: string;
  /** ISO date (YYYY-MM-DD) of the exam being prepared for. */
  examDate?: string;
  examLabel?: string;
  createdAt: number;
}

export type CoursePatch = Partial<
  Pick<Course, "name" | "code" | "professor" | "examDate" | "examLabel">
>;

export interface MaterialMeta {
  id: string;
  courseId: string;
  title: string;
  fileName?: string;
  kind: MaterialKind;
  chars: number;
  /** How the text was obtained; OCR output is noisier and worth flagging. */
  method?: ExtractMethod;
  createdAt: number;
}

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  questions: ExamQuestion[];
  timeLimit: number;
  createdAt: number;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  perQuestion: Array<{ id: number; awarded: number; max: number; feedback: string }>;
  weakTopics: string[];
  summary: string;
}

export interface Attempt {
  id: string;
  examId: string;
  courseId: string;
  answers: Record<string, string | number>;
  result?: GradeResult;
  startedAt: number;
  submittedAt?: number;
  gradedAt?: number;
}

export interface Stats {
  courses: number;
  materials: number;
  exams: number;
  attempts: number;
  graded: number;
  averageScore: number;
  streak: number;
  recentScores: number[];
  weakTopics: Array<{ topic: string; count: number }>;
}

export interface ReadinessBreakdown {
  topic: string;
  weight: number;
  mastery: number;
  rawAccuracy: number;
  evidence: number;
  attempted: boolean;
}

export interface Readiness {
  /** Null when there is no graded evidence at all. */
  readinessPct: number | null;
  predictedGrade: string | null;
  riskLevel: "low" | "medium" | "high" | "unknown";
  highRiskTopics: string[];
  /** 0-1: how much the score can be trusted. */
  confidence: number;
  limiting: string;
  gradedAttempts: number;
  topics: ReadinessBreakdown[];
}

export interface Settings {
  model?: string;
  streak?: number;
  lastActiveDay?: string;
  currentCourseId?: string;
  planDone?: Record<string, boolean>;
}

export interface Card {
  id: string;
  front: string;
  back: string;
  topic?: string;
  box: number;
  due: number;
}

export interface Deck {
  id: string;
  courseId: string;
  title: string;
  source: "ai" | "mistakes";
  cards: Card[];
  createdAt: number;
}

export type Rating = "again" | "hard" | "good";
export type Difficulty = "foundational" | "exam" | "challenging";

export interface CoachTurn {
  role: "user" | "coach";
  text: string;
}

/** A file chosen in the OS picker, before its text has been committed. */
export interface PickedFile {
  path: string;
  title: string;
  kind: MaterialKind;
  /** Only set for PDFs — the renderer extracts those. */
  bytes?: Uint8Array;
  /** Set for docx/text, already extracted in the main process. */
  text?: string;
  /** Set when the file cannot be imported at all. */
  error?: string;
}

export interface GenerateResult {
  exam: Exam;
  /** Characters of source material actually sent to the model. */
  contextChars: number;
  /** Characters available across the selected materials. */
  availableChars: number;
  batches: number;
  /** False only on the first exam for a given material set. */
  profileReused: boolean;
}

export interface Failure {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}
export type Result<T> = { ok: true; data: T } | Failure;

export interface ExeeApi {
  getSession(): Promise<Result<SessionState>>;
  signIn(): Promise<Result<SessionState>>;
  disconnect(): Promise<Result<void>>;
  listModels(): Promise<Result<ChatGPTModel[]>>;
  openUsage(): Promise<Result<void>>;

  stats(): Promise<Result<Stats>>;
  readiness(courseId?: string): Promise<Result<Readiness>>;
  settings(): Promise<Result<Settings>>;
  updateSettings(patch: Partial<Settings>): Promise<Result<Settings>>;
  touchStreak(): Promise<Result<Settings>>;

  listCourses(): Promise<Result<Course[]>>;
  createCourse(input: { name: string } & CoursePatch): Promise<Result<Course>>;
  updateCourse(input: { id: string; patch: CoursePatch }): Promise<Result<Course>>;
  deleteCourse(id: string): Promise<Result<void>>;

  listMaterials(courseId?: string): Promise<Result<MaterialMeta[]>>;
  pickMaterials(): Promise<Result<PickedFile[]>>;
  commitMaterial(input: {
    courseId: string;
    path: string;
    title: string;
    kind: MaterialKind;
    text: string;
    method?: ExtractMethod;
  }): Promise<Result<MaterialMeta>>;
  addTextMaterial(input: {
    courseId: string;
    title: string;
    text: string;
  }): Promise<Result<MaterialMeta>>;
  deleteMaterial(id: string): Promise<Result<void>>;

  listExams(courseId?: string): Promise<Result<Exam[]>>;
  getExam(id: string): Promise<Result<Exam | undefined>>;
  deleteExam(id: string): Promise<Result<void>>;
  examQuestions(id: string): Promise<Result<ExamQuestion[]>>;
  generateExam(input: {
    model: string;
    courseId: string;
    courseName: string;
    courseCode?: string;
    professor?: string;
    title: string;
    material: string;
    materialIds: string[];
    mcCount: number;
    saCount: number;
    laCount: number;
    /** Minutes; 0 means untimed. */
    timeLimit: number;
    focusTopics?: string[];
    difficulty?: Difficulty;
  }): Promise<Result<GenerateResult>>;

  listAttempts(examId?: string): Promise<Result<Attempt[]>>;
  getAttempt(id: string): Promise<Result<Attempt | undefined>>;
  startAttempt(input: { examId: string; courseId: string }): Promise<Result<Attempt>>;
  gradeExam(input: {
    attemptId: string;
    model: string;
    courseName: string;
    questions: ExamQuestion[];
    answers: Record<string, string | number>;
  }): Promise<Result<GradeResult>>;

  generateFlashcards(input: {
    model: string;
    courseId: string;
    courseName: string;
    title: string;
    materialIds: string[];
    count: number;
  }): Promise<Result<Deck>>;
  listDecks(courseId?: string): Promise<Result<Deck[]>>;
  reviewCard(input: { deckId: string; cardId: string; rating: Rating }): Promise<Result<Card>>;
  deleteDeck(id: string): Promise<Result<void>>;

  askCoach(input: {
    model: string;
    courseId: string;
    question: string;
    history: CoachTurn[];
  }): Promise<Result<string>>;

  onSession(listener: (state: SessionState) => void): () => void;
  onProgress(listener: (message: string) => void): () => void;
  onCoachDelta(listener: (delta: string) => void): () => void;
}

declare global {
  interface Window {
    exee: ExeeApi;
  }
}

/** Narrows a Result to its failure branch. */
export const isFailure = (r: { ok: boolean }): r is Failure => !r.ok;
