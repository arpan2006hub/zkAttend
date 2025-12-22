import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import ConnectWallet from './components/ConnectWallet';
import Home from './pages/Home';
import Teacher from './pages/Teacher';
import Student from './pages/Student';
import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={wagmiConfig}>
        <Router>
          <div className="container">
            <nav className="flex justify-between items-center mb-6">
              <div className="flex gap-4">
                <Link className="btn" to="/">Home</Link>
                <Link className="btn" to="/teacher">Teacher</Link>
                <Link className="btn" to="/student">Student</Link>
              </div>
              <ConnectWallet />
            </nav>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/teacher" element={<Teacher />} />
              <Route path="/student" element={<Student />} />
            </Routes>
          </div>
        </Router>
      </WagmiConfig>
    </QueryClientProvider>
  );
}
