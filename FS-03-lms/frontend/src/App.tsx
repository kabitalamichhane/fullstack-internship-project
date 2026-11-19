import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import CatalogPage from './pages/CatalogPage';
import CourseDetailPage from './pages/CourseDetailPage';
import LearnPage from './pages/LearnPage';
import QuizPage from './pages/QuizPage';
import LiveClassPage from './pages/LiveClassPage';
import MyLearningPage from './pages/MyLearningPage';
import VerifyPage from './pages/VerifyPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import InstructorDashboard from './pages/instructor/InstructorDashboard';
import CourseEditor from './pages/instructor/CourseEditor';
import AdminPage from './pages/admin/AdminPage';

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/verify/:code" element={<VerifyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/learn/:courseId/:lessonId" element={<LearnPage />} />
          <Route path="/quiz/:id" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
          <Route path="/live/:id" element={<ProtectedRoute><LiveClassPage /></ProtectedRoute>} />
          <Route path="/my-learning" element={<ProtectedRoute roles={['STUDENT']}><MyLearningPage /></ProtectedRoute>} />
          <Route path="/instructor" element={<ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}><InstructorDashboard /></ProtectedRoute>} />
          <Route path="/instructor/courses/:id" element={<ProtectedRoute roles={['INSTRUCTOR', 'ADMIN']}><CourseEditor /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<p className="p-8 text-center text-slate-500">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
