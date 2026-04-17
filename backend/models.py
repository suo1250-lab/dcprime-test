from sqlalchemy import Column, Integer, String, Boolean, Date, JSON, Float, ForeignKey, DateTime, UniqueConstraint, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# Student ↔ Class 다대다 중간 테이블
student_classes = Table(
    "student_classes",
    Base.metadata,
    Column("student_id", Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
    Column("class_id", Integer, ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
)


class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    grade = Column(String(20), nullable=False)
    subject = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    word_test_id = Column(Integer, ForeignKey("word_tests.id", ondelete="SET NULL"), nullable=True)
    word_day_start = Column(Integer, nullable=True)
    word_day_end = Column(Integer, nullable=True)

    students = relationship("Student", secondary=student_classes, back_populates="classes")
    rules = relationship("ClassRule", back_populates="class_")
    word_test = relationship("WordTest", foreign_keys=[word_test_id])


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    grade = Column(String(20), nullable=False)
    school = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    historical_student_id = Column(Integer, ForeignKey("historical_students.id", ondelete="SET NULL"), nullable=True)
    teacher = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    classes = relationship("Class", secondary=student_classes, back_populates="students")
    results = relationship("TestResult", back_populates="student")

    @property
    def class_ids(self):
        return [c.id for c in self.classes]

    @property
    def class_names(self):
        return [c.name for c in self.classes]


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True)
    title = Column(String(100), nullable=False)
    grade = Column(String(20), nullable=False)
    subject = Column(String(20), nullable=False)
    question_count = Column(Integer, nullable=False)
    answers = Column(JSON, nullable=False)
    test_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    results = relationship("TestResult", back_populates="test")
    rules = relationship("ClassRule", back_populates="test")


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    test_id = Column(Integer, ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=False)
    total = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("student_id", "test_id"),)

    student = relationship("Student", back_populates="results")
    test = relationship("Test", back_populates="results")
    question_results = relationship("QuestionResult", back_populates="result", cascade="all, delete-orphan")


class QuestionResult(Base):
    __tablename__ = "question_results"

    id = Column(Integer, primary_key=True)
    result_id = Column(Integer, ForeignKey("test_results.id", ondelete="CASCADE"), nullable=False)
    question_no = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)

    result = relationship("TestResult", back_populates="question_results")


class ClassRule(Base):
    __tablename__ = "class_rules"

    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    min_score = Column(Integer, nullable=False)
    max_score = Column(Integer, nullable=False)

    test = relationship("Test", back_populates="rules")
    class_ = relationship("Class", back_populates="rules")


class TestQuestionTag(Base):
    __tablename__ = "test_question_tags"
    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("tests.id", ondelete="CASCADE"), nullable=False)
    question_no = Column(Integer, nullable=False)
    tag = Column(String(100), nullable=False)
    __table_args__ = (UniqueConstraint("test_id", "question_no"),)


class WordTest(Base):
    __tablename__ = "word_tests"
    id = Column(Integer, primary_key=True)
    title = Column(String(100), nullable=False)
    grade = Column(String(20), nullable=False)
    direction = Column(String(10), nullable=False)
    test_date = Column(Date, nullable=False)
    correct_threshold = Column(Float, nullable=False, default=0.85)
    ambiguous_threshold = Column(Float, nullable=False, default=0.65)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    items = relationship("WordTestItem", back_populates="word_test", cascade="all, delete-orphan", order_by="WordTestItem.item_no")
    submissions = relationship("WordSubmission", back_populates="word_test", cascade="save-update, merge")

class WordTestItem(Base):
    __tablename__ = "word_test_items"
    id = Column(Integer, primary_key=True)
    word_test_id = Column(Integer, ForeignKey("word_tests.id", ondelete="CASCADE"), nullable=False)
    item_no = Column(Integer, nullable=False)
    question = Column(String(200), nullable=False)
    answer = Column(String(200), nullable=False)
    day = Column(Integer, nullable=True)
    word_test = relationship("WordTest", back_populates="items")

class WordSubmission(Base):
    __tablename__ = "word_submissions"
    id = Column(Integer, primary_key=True)
    word_test_id = Column(Integer, ForeignKey("word_tests.id", ondelete="SET NULL"), nullable=True)
    student_name = Column(String(50), nullable=False)
    grade = Column(String(20), nullable=False)
    direction = Column(String(10), nullable=True)
    image_path = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="pending_manual")
    score = Column(Integer, nullable=True)
    total = Column(Integer, nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    word_test = relationship("WordTest", back_populates="submissions")
    items = relationship("WordSubmissionItem", back_populates="submission", cascade="all, delete-orphan", order_by="WordSubmissionItem.item_no")

class WordSubmissionItem(Base):
    __tablename__ = "word_submission_items"
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("word_submissions.id", ondelete="CASCADE"), nullable=False)
    item_no = Column(Integer, nullable=False)
    question = Column(String(200), nullable=True)
    correct_answer = Column(String(200), nullable=True)
    student_answer = Column(String(200), nullable=True)
    is_correct = Column(Boolean, nullable=True)
    submission = relationship("WordSubmission", back_populates="items")


class HistoricalStudent(Base):
    __tablename__ = "historical_students"
    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    grade = Column(String(20), nullable=True)
    school = Column(String(100), nullable=True)
    subject = Column(String(20), nullable=True)
    score = Column(Integer, nullable=True)
    total = Column(Integer, nullable=True)
    score_pct = Column(Integer, nullable=True)
    outcome = Column(String(20), default="배정확정")
    source_file = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    question_results = relationship("HistoricalQuestionResult", back_populates="student", cascade="all, delete-orphan")


class HistoricalQuestionResult(Base):
    __tablename__ = "historical_question_results"
    id = Column(Integer, primary_key=True)
    historical_student_id = Column(Integer, ForeignKey("historical_students.id", ondelete="CASCADE"), nullable=False)
    question_no = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    student = relationship("HistoricalStudent", back_populates="question_results")


class TeacherWordConfig(Base):
    __tablename__ = "teacher_word_configs"
    id = Column(Integer, primary_key=True)
    teacher_name = Column(String(50), nullable=False, unique=True)
    word_test_id = Column(Integer, ForeignKey("word_tests.id", ondelete="SET NULL"), nullable=True)
    day_start = Column(Integer, nullable=True)
    day_end = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    word_test = relationship("WordTest")


class MathTest(Base):
    __tablename__ = "math_tests"
    id = Column(Integer, primary_key=True)
    title = Column(String(100), nullable=False)
    grade = Column(String(20), nullable=False)
    test_date = Column(Date, nullable=False)
    num_questions = Column(Integer, nullable=False, default=0)
    answers = Column(JSON, nullable=False, default=[])
    tags = Column(JSON, nullable=True, default={})  # {question_no: tag} e.g. {"1": "함수", "2": "인수분해"}
    source_file = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    submissions = relationship("MathSubmission", back_populates="math_test", cascade="all, delete-orphan")


class MathSubmission(Base):
    __tablename__ = "math_submissions"
    id = Column(Integer, primary_key=True)
    math_test_id = Column(Integer, ForeignKey("math_tests.id", ondelete="CASCADE"), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    student_name = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    score = Column(Integer, nullable=True)
    total = Column(Integer, nullable=True)
    image_path = Column(String(500), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    math_test = relationship("MathTest", back_populates="submissions")
    items = relationship("MathSubmissionItem", back_populates="submission", cascade="all, delete-orphan", order_by="MathSubmissionItem.question_no")


class MathSubmissionItem(Base):
    __tablename__ = "math_submission_items"
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("math_submissions.id", ondelete="CASCADE"), nullable=False)
    question_no = Column(Integer, nullable=False)
    student_answer = Column(Integer, nullable=True)
    correct_answer = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    submission = relationship("MathSubmission", back_populates="items")


class WordTutoringSession(Base):
    __tablename__ = "word_tutoring_sessions"
    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    word_test_id = Column(Integer, ForeignKey("word_tests.id", ondelete="SET NULL"), nullable=True)
    session_date = Column(Date, nullable=False)
    attempt1_total = Column(Integer, nullable=True)
    attempt1_wrong = Column(Integer, nullable=True)
    attempt2_total = Column(Integer, nullable=True)
    attempt2_wrong = Column(Integer, nullable=True)
    attempt3_total = Column(Integer, nullable=True)
    attempt3_wrong = Column(Integer, nullable=True)
    memo = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    student = relationship("Student", backref="tutoring_sessions")
    word_test = relationship("WordTest")
