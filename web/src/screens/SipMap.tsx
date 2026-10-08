import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Mascot } from "../components/Mascot";
import { Screen } from "../components/Screen";
import { SipIcon, sipPalette } from "../components/SipIcon";
import {
  itemVariants as item,
  listVariants as list,
} from "../components/SipCard";
import { Button, Icon, IconButton, Star } from "../components/ui";
import { Api, ApiError, type LessonBrief } from "../lib/api";
import { duration, LESSON_MINUTES } from "../lib/format";
import { haptic, play } from "../lib/sound";
import { Confetti, DeleteButton } from "./ProgramView";
import { SipPathMap } from "./SipPathMap";

type LessonState = "done" | "now" | "locked";

/** A Sip: the climbing map by default, or a list of lessons grouped by module (the current one is the big caramel card). */
export function SipMap() {
  const { sipId = "" } = useParams();
  const nav = useNavigate();
  const loc = useLocation() as {
    state?: { completed?: string; fresh?: boolean };
  };
  const justCompleted = loc.state?.completed;
  const [view, setView] = useState<"map" | "list">(() => {
    try {
      return sessionStorage.getItem("sipp.view") === "list" ? "list" : "map";
    } catch {
      return "map";
    }
  });
  const toggleView = () => {
    const v = view === "map" ? "list" : "map";
    setView(v);
    try {
      sessionStorage.setItem("sipp.view", v);
    } catch {
      /* ignore */
    }
  };
  const stats = useQuery({ queryKey: ["stats"], queryFn: Api.stats });
  const review = useQuery({ queryKey: ["review"], queryFn: Api.review });
  const sip = useQuery({
    queryKey: ["sip", sipId],
    queryFn: () => Api.sip(sipId),
    refetchInterval: (q) =>
      q.state.data?.modules.some((m) =>
        m.lessons.some(
          (l) => l.status === "queued" || l.status === "generating",
        ),
      )
        ? 4000
        : false,
  });

  const qc = useQueryClient();
  const extend = useMutation({
    mutationFn: () => Api.extendSip(sipId),
    onSuccess: (p) => {
      play("whoosh");
      void qc.invalidateQueries({ queryKey: ["sip", sipId] });
      void qc.invalidateQueries({ queryKey: ["programs"] });
      nav(`/programs/${p.id}`);
    },
    onError: (e) => {
      // Already turned into a program (e.g. from another device): just open it.
      const pid =
        e instanceof ApiError
          ? (e.detail as { program_id?: string } | undefined)?.program_id
          : undefined;
      if (pid) nav(`/programs/${pid}`);
      else play("wrong");
    },
  });
  const programId = sip.data?.program_id;
  const remove = useMutation({
    mutationFn: () => Api.deleteSip(sipId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sips"] });
      void qc.invalidateQueries({ queryKey: ["programs"] });
      void qc.invalidateQueries({ queryKey: ["plan"] });
      nav(programId ? `/programs/${programId}` : "/library", { replace: true });
    },
  });

  const modules = useMemo(() => sip.data?.modules ?? [], [sip.data]);
  const flat = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const nowIdx = flat.findIndex((l) => !l.completed);
  const now = flat[nowIdx];
  const stateOf = (l: LessonBrief): LessonState => {
    const i = flat.indexOf(l);
    return nowIdx === -1 || i < nowIdx
      ? "done"
      : i === nowIdx
        ? "now"
        : "locked";
  };
  const done = nowIdx === -1 ? flat.length : nowIdx;
  const totalStars = flat.reduce((s, l) => s + (l.stars ?? 0), 0);
  const name = sip.data?.title ?? sip.data?.input_text ?? "";
  const pal = sipPalette(name);

  // Bring the current lesson into view on open.
  const nowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (view === "list" && nowIdx > 2)
      nowRef.current?.scrollIntoView({ block: "center" });
  }, [nowIdx, sip.isSuccess, view]);

  useEffect(() => {
    if (!justCompleted || !now) return;
    const t = setTimeout(() => {
      play("unlock");
      haptic(15);
    }, 500);
    return () => clearTimeout(t);
  }, [justCompleted, now]);

  if (sip.isLoading || !sip.data) {
    return (
      <Screen>
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Mascot mood="think" size={90} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {view === "map" ? (
        <SipPathMap
          modules={modules}
          title={name}
          chapter={sip.data.chapter}
          totalStars={totalStars}
          streak={stats.data?.streak_days}
          justCompleted={!!justCompleted}
          fresh={!!loc.state?.fresh}
          bottomPad={nowIdx === -1 ? 200 : 24}
          onBack={() => nav(programId ? `/programs/${programId}` : "/")}
          onList={toggleView}
          onOpen={(id) => nav(`/lessons/${id}`)}
          reviewDue={review.data?.due_count}
          onReview={() => nav("/review")}
        />
      ) : (
        <div
          className="scroll"
          style={{ paddingBottom: nowIdx === -1 ? 220 : 48 }}
        >
          <div
            style={{
              position: "relative",
              borderRadius: "0 0 40px 40px",
              background: pal.bg,
              padding: "calc(var(--safe-top) + 14px) 20px 22px",
              overflow: "hidden",
            }}
          >
            <Confetti seed={2} />
            <div
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <IconButton
                label="Retour"
                onClick={() => nav(programId ? `/programs/${programId}` : "/")}
              >
                {Icon.back}
              </IconButton>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="display"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 16,
                    padding: "0 12px",
                    height: 36,
                    borderRadius: 18,
                    background: "rgba(255,255,255,.7)",
                  }}
                >
                  <Star size={16} />
                  {totalStars}
                </span>
                <IconButton label="Voir la carte" onClick={toggleView}>
                  {Icon.map}
                </IconButton>
              </div>
            </div>
            <div
              style={{
                position: "relative",
                marginTop: 12,
                display: "flex",
                alignItems: "flex-end",
                gap: 14,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {sip.data.chapter && (
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: pal.ink }}
                  >
                    Chapitre {sip.data.chapter}
                  </span>
                )}
                <h1
                  className="display"
                  style={{ fontSize: 26, lineHeight: 1.08 }}
                >
                  {name}
                </h1>
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: 10,
                      borderRadius: 5,
                      background: "rgba(255,255,255,.7)",
                      overflow: "hidden",
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(done / Math.max(1, flat.length)) * 100}%`,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 80,
                        damping: 18,
                        delay: 0.2,
                      }}
                      style={{
                        height: "100%",
                        borderRadius: 5,
                        background: "var(--primary)",
                      }}
                    />
                  </div>
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: pal.ink }}
                  >
                    {done} / {flat.length}
                  </span>
                </div>
              </div>
              <motion.div
                initial={{ scale: 0.6, rotate: 10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 14 }}
              >
                <SipIcon text={name} size={104} radius={0} />
              </motion.div>
            </div>
          </div>

          {sip.data.summary && (
            <p
              style={{
                padding: "16px 24px 0",
                fontSize: 15,
                lineHeight: 1.5,
                color: "var(--muted)",
              }}
            >
              {sip.data.summary}{" "}
              <span style={{ whiteSpace: "nowrap" }}>
                · {duration(flat.length)}
              </span>
            </p>
          )}

          <motion.div
            variants={list}
            initial="hidden"
            animate="show"
            style={{
              padding: "6px 12px 0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {modules.map((m) => (
              <motion.section
                key={m.id}
                variants={item}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 14,
                }}
              >
                <span
                  style={{
                    padding: "0 12px 6px",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: m.lessons.some((l) => stateOf(l) !== "locked")
                      ? "var(--faint)"
                      : "#C4BAB0",
                  }}
                >
                  Module {m.position} · {m.title} ·{" "}
                  {m.lessons.length * LESSON_MINUTES} min
                </span>
                {m.lessons.map((l) => {
                  const st = stateOf(l);
                  return st === "now" ? (
                    <NowCard
                      key={l.id}
                      ref={nowRef}
                      lesson={l}
                      index={flat.indexOf(l)}
                      unlocking={!!justCompleted}
                      onOpen={() => nav(`/lessons/${l.id}`)}
                    />
                  ) : (
                    <LessonRow
                      key={l.id}
                      lesson={l}
                      index={flat.indexOf(l)}
                      state={st}
                      hint={now?.title}
                      onOpen={() => nav(`/lessons/${l.id}`)}
                    />
                  );
                })}
              </motion.section>
            ))}
            <div
              style={{
                marginTop: 18,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <DeleteButton
                label={programId ? "Supprimer ce chapitre" : "Supprimer ce Sip"}
                confirm={
                  programId
                    ? "Tu pourras le régénérer depuis le programme (ça coûte une création)."
                    : "Ta progression sera perdue. Ça libère une place."
                }
                busy={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            </div>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {flat.length > 0 && nowIdx === -1 && (
          <motion.div
            key="finished"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 26,
              delay: justCompleted ? 0.6 : 0.3,
            }}
            style={{
              position: "absolute",
              zIndex: 3,
              left: 16,
              right: 16,
              bottom: "calc(var(--safe-bottom) + 16px)",
              borderRadius: 28,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "var(--surface)",
              boxShadow: "0 10px 30px rgba(29,26,23,.12)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Mascot mood="bravo" size={52} />
              <div>
                <span className="display" style={{ fontSize: 18 }}>
                  {programId ? "Chapitre terminé !" : "Sip terminé !"}
                </span>
                <p className="muted" style={{ fontSize: 14 }}>
                  {programId
                    ? "La suite de ton programme t’attend."
                    : "Envie d’aller plus loin sur ce sujet ?"}
                </p>
              </div>
            </div>
            {programId ? (
              <Button sound="pop" onClick={() => nav(`/programs/${programId}`)}>
                Voir la suite du programme
              </Button>
            ) : (
              <Button
                sound="pop"
                disabled={extend.isPending}
                onClick={() => extend.mutate()}
              >
                {extend.isPending ? (
                  <Mascot mood="think" size={30} />
                ) : (
                  "Aller plus loin"
                )}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  );
}

function NowCard({
  ref,
  lesson,
  index,
  unlocking,
  onOpen,
}: {
  ref: React.Ref<HTMLDivElement>;
  lesson: LessonBrief;
  index: number;
  unlocking: boolean;
  onOpen: () => void;
}) {
  const preparing = lesson.status !== "ready";
  return (
    <motion.div
      ref={ref}
      initial={unlocking ? { scale: 0.8, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 14,
        delay: unlocking ? 0.4 : 0,
      }}
      style={{ margin: "4px 0" }}
    >
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          play("pop");
          haptic();
          onOpen();
        }}
        aria-label={`Commencer : ${lesson.title}`}
        style={{
          width: "100%",
          border: "none",
          textAlign: "left",
          borderRadius: 24,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--primary)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            right: -24,
            top: -24,
            width: 90,
            height: 90,
            borderRadius: 45,
            background: "rgba(255,255,255,.12)",
          }}
        />
        <span
          style={{
            position: "relative",
            width: 44,
            height: 44,
            borderRadius: 22,
            background: "#fff",
            color: "var(--primary)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              background: "#fff",
              opacity: 0,
              animation: "halo 2s ease-out infinite",
            }}
          />
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4l13 8-13 8z" fill="currentColor" />
          </svg>
        </span>
        <span
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(255,255,255,.82)",
            }}
          >
            Leçon {index + 1} ·{" "}
            {preparing ? "je la prépare" : `${LESSON_MINUTES} min`}
          </span>
          <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25 }}>
            {lesson.title}
          </span>
        </span>
        <span style={{ position: "relative", display: "grid" }}>
          <Mascot size={40} />
        </span>
      </motion.button>
    </motion.div>
  );
}

function LessonRow({
  lesson,
  index,
  state,
  hint,
  onOpen,
}: {
  lesson: LessonBrief;
  index: number;
  state: LessonState;
  hint?: string;
  onOpen: () => void;
}) {
  const shake = useAnimationControls();
  const [showHint, setShowHint] = useState(false);
  const done = state === "done";
  return (
    <div style={{ position: "relative" }}>
      <motion.button
        animate={shake}
        whileTap={{ scale: 0.98 }}
        aria-label={done ? undefined : `${lesson.title} (verrouillée)`}
        onClick={() => {
          if (done) {
            play("tap");
            onOpen();
            return;
          }
          play("wrong");
          haptic(20);
          setShowHint(true);
          void shake.start({
            x: [0, -6, 6, -4, 4, 0],
            transition: { duration: 0.35 },
          });
          setTimeout(() => setShowHint(false), 1800);
        }}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 18,
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            background: done ? "var(--mint)" : "var(--bg-deep)",
            color: done ? "var(--mint-ink)" : "var(--faint)",
            fontFamily: "var(--display)",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {done ? Icon.check(16) : index + 1}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.3,
              color: done ? "var(--ink)" : "#A39A90",
            }}
          >
            {lesson.title}
          </span>
          <span style={{ fontSize: 13, color: "var(--faint)" }}>
            {done ? "Revoir" : `${LESSON_MINUTES} min`}
          </span>
        </span>
        {done && (
          <span style={{ display: "flex", gap: 1, flexShrink: 0 }}>
            {[1, 2, 3].map((i) => (
              <Star key={i} size={13} filled={(lesson.stars ?? 0) >= i} />
            ))}
          </span>
        )}
      </motion.button>
      <AnimatePresence>
        {showHint && hint && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            style={{
              position: "absolute",
              zIndex: 4,
              left: 60,
              right: 12,
              top: -30,
              borderRadius: 14,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 500,
              background: "var(--ink)",
              color: "#fff",
            }}
          >
            Termine d’abord « {hint} »
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
