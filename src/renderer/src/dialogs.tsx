/* ============================================================
   EXEE AI — shared dialogs
   Course details (create / edit, including the exam date the
   study plan counts down to) and the "New practice exam" sheet.
   ============================================================ */
import { useEffect, useState } from "react";
import { Icon, Labeled, Modal, Segmented, Switch, useToast } from "./ui";
import { isFailure, type Course, type Difficulty, type MaterialMeta } from "./types";

/* ---------------- Course ---------------- */
export function CourseDialog({
  open,
  course,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  /** Present when editing. */
  course?: Course;
  onClose: () => void;
  onSaved: (course: Course) => void;
  onDeleted?: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [professor, setProfessor] = useState("");
  const [examLabel, setExamLabel] = useState("");
  const [examDate, setExamDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(course?.name ?? "");
    setCode(course?.code ?? "");
    setProfessor(course?.professor ?? "");
    setExamLabel(course?.examLabel ?? "");
    setExamDate(course?.examDate ?? "");
    setConfirmDelete(false);
  }, [open, course]);

  const submit = async () => {
    const fields = {
      name: name.trim(),
      code: code.trim() || undefined,
      professor: professor.trim() || undefined,
      examLabel: examLabel.trim() || undefined,
      examDate: examDate || undefined,
    };
    const r = course
      ? await window.exee.updateCourse({ id: course.id, patch: fields })
      : await window.exee.createCourse(fields);
    if (isFailure(r)) return toast(r.message, "error");
    onSaved(r.data);
  };

  const remove = async () => {
    if (!course) return;
    const r = await window.exee.deleteCourse(course.id);
    if (isFailure(r)) return toast(r.message, "error");
    toast(`Deleted ${course.name} and everything in it`);
    onDeleted?.(course.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={course ? "Course details" : "New course"}
      sub="Group your material so generated questions stay on topic."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Labeled label="Course name">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cell Biology" autoFocus />
        </Labeled>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Labeled label="Course code" hint="optional">
            <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BIO 201" />
          </Labeled>
          <Labeled label="Professor" hint="optional">
            <input className="field" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Dr. Chen" />
          </Labeled>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Labeled label="Upcoming exam" hint="optional">
            <input className="field" value={examLabel} onChange={(e) => setExamLabel(e.target.value)} placeholder="Midterm" />
          </Labeled>
          <Labeled label="Exam date" hint="drives your plan">
            <input className="field" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </Labeled>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {course &&
          (confirmDelete ? (
            <button className="btn btn-danger btn-sm" onClick={() => void remove()}>
              Delete course and all its data
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--wine)" }} onClick={() => setConfirmDelete(true)}>
              Delete course
            </button>
          ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => void submit()}>
          {course ? "Save" : "Create course"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- New exam ---------------- */
export interface ExamConfig {
  materialIds: string[];
  focusTopics: string[];
  count: number;
  difficulty: Difficulty;
  written: boolean;
  timed: boolean;
  /** Reveal answers after each question instead of only at the end. */
  checkEach: boolean;
  /** The student's own requests for this exam. */
  instructions: string;
  title?: string;
}

const MAX_INSTRUCTIONS = 1000;

export interface ExamPreset {
  materialIds?: string[];
  focusTopics?: string[];
  title?: string;
}

/** Multiple choice at 90 s, written answers at 6 min — the prototype's pacing. */
export function questionMix(count: number, written: boolean) {
  const sa = written ? Math.max(1, Math.round(count * 0.3)) : 0;
  return { mc: count - sa, sa };
}

export function examMinutes(count: number, written: boolean): number {
  const { mc, sa } = questionMix(count, written);
  return Math.ceil(mc * 1.5 + sa * 6);
}

export function NewExamDialog({
  open,
  course,
  topics,
  preset,
  onClose,
  onGenerate,
  onAddMaterial,
}: {
  open: boolean;
  course: Course | undefined;
  /** Course topics from the readiness profile, weakest first. */
  topics: string[];
  preset: ExamPreset | null;
  onClose: () => void;
  onGenerate: (config: ExamConfig) => void;
  /** Leaves the form to add study material. */
  onAddMaterial: () => void;
}) {
  const [materials, setMaterials] = useState<MaterialMeta[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("exam");
  const [written, setWritten] = useState(false);
  const [timed, setTimed] = useState(true);
  const [checkEach, setCheckEach] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [askNoMaterial, setAskNoMaterial] = useState(false);

  useEffect(() => {
    if (!open || !course) return;
    setFocus(preset?.focusTopics ?? []);
    setAskNoMaterial(false);
    void (async () => {
      const r = await window.exee.listMaterials(course.id);
      if (isFailure(r)) return;
      setMaterials(r.data);
      setSelected(preset?.materialIds?.length ? preset.materialIds : r.data.map((m) => m.id));
    })();
  }, [open, course, preset]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const ready = count > 0;
  const { sa } = questionMix(count, written);

  const config = (): ExamConfig => ({
    materialIds: selected,
    focusTopics: focus,
    count,
    difficulty,
    written,
    timed,
    checkEach,
    instructions: instructions.trim(),
    title: preset?.title,
  });

  // With no material the exam can still be written, but it will be generic:
  // say so and let the student choose.
  const generateClicked = () => {
    if (selected.length === 0) setAskNoMaterial(true);
    else onGenerate(config());
  };

  if (askNoMaterial) {
    return (
      <Modal
        open={open}
        onClose={() => setAskNoMaterial(false)}
        width={480}
        title="Generate without study material?"
        sub={
          materials.length === 0
            ? "This course has no material yet."
            : "You haven’t selected any of this course’s material."
        }
      >
        <p style={{ font: "400 14.5px/22px var(--font)", color: "var(--ink-2)" }}>
          Without your slides or notes, questions are written from general knowledge of {course?.name ?? "the subject"}. They
          won’t follow your lectures, your professor’s emphasis or the terms your course uses, and the readiness score will
          be less reliable.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => { setAskNoMaterial(false); onGenerate(config()); }}>
            Generate anyway
          </button>
          <button className="btn btn-primary" onClick={() => { setAskNoMaterial(false); onAddMaterial(); }}>
            <Icon name="upload_file" size={19} />
            Add study material
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="New practice exam"
      sub="Questions are written from your material and matched to exam level."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Source material
          {materials.length > 0 && (
            <span className="hint">
              {selected.length} of {materials.length} selected
            </span>
          )}
        </span>
        {materials.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, background: "var(--sand-2)", color: "var(--ink-3)", font: "400 13.5px/20px var(--font)" }}>
            <span style={{ flex: 1 }}>No material in this course yet. Exams written without it are generic.</span>
            <button type="button" className="btn btn-sm btn-outline" onClick={onAddMaterial}>
              Add material
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 210, overflowY: "auto" }}>
            {materials.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button key={m.id} type="button" className={`radio-row square${on ? " on" : ""}`} onClick={() => setSelected((s) => toggle(s, m.id))}>
                  <span className="dot" />
                  <span className="ellipsis" style={{ flex: 1, font: "500 14px/19px var(--font)" }}>
                    {m.title}
                  </span>
                  <span style={{ font: "500 11.5px/1 var(--font)", color: "var(--ink-5)" }}>{Math.max(1, Math.round(m.chars / 1000))}k chars</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {topics.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label" style={{ marginBottom: 0 }}>
            Focus<span className="hint">{focus.length ? `${focus.length} topic${focus.length === 1 ? "" : "s"}` : "whole course"}</span>
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {topics.slice(0, 12).map((t) => (
              <button key={t} type="button" className={focus.includes(t) ? "pill-toggle on" : "pill-toggle"} style={{ height: 32, padding: "0 12px", fontSize: 12.5 }} onClick={() => setFocus((f) => toggle(f, t))}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label" style={{ marginBottom: 0 }}>Questions</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[6, 10, 20, 40].map((n) => (
              <button key={n} type="button" className={count === n ? "pill-toggle on" : "pill-toggle"} style={{ width: 48, height: 38, padding: 0 }} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label" style={{ marginBottom: 0 }}>Difficulty</span>
          <Segmented
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: "foundational", label: "Foundational" },
              { value: "exam", label: "Exam level" },
              { value: "challenging", label: "Challenging" },
            ]}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Switch
          on={written}
          onChange={setWritten}
          title="Include written answers"
          detail={written ? `${sa} short-answer question${sa === 1 ? "" : "s"}, graded with feedback on your plan` : "Multiple choice only — graded instantly on your computer"}
        />
        <Switch
          on={timed}
          onChange={setTimed}
          title="Timed, like the real exam"
          detail={timed ? `${examMinutes(count, written)} minutes · 90 seconds per multiple-choice question` : "No clock — take as long as you need"}
        />
        <Switch
          on={checkEach}
          onChange={setCheckEach}
          title="Check answers as I go"
          detail={checkEach ? "Each multiple-choice answer is marked as soon as you check it" : "Answers are revealed after you submit, like the real exam"}
        />
      </div>

      <Labeled label="Your instructions" hint="optional">
        <textarea
          className="field"
          rows={3}
          maxLength={MAX_INSTRUCTIONS}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="For example: more calculation questions, include past-paper style essay prompts, skip lecture 3, use SI units."
          style={{ minHeight: 84 }}
        />
      </Labeled>

      <button
        className="btn btn-primary btn-lg"
        disabled={!ready}
        onClick={generateClicked}
      >
        <Icon name="auto_awesome" size={20} />
        Generate exam
      </button>
    </Modal>
  );
}
