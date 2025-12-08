import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DBProvider, UserProvider } from './lib/store';
import { Layout } from './components/Layout';
import { Home } from './features/home/Home';
import { CourseList } from './features/courses/CourseList';
import { CourseEditor } from './features/courses/CourseEditor';
import { Play } from './features/scoring/Play';
import { Scorecard } from './features/scoring/Scorecard';
import { MatchplaySetup } from './features/matchplay/MatchplaySetup';
import { MatchplayScorecard } from './features/matchplay/MatchplayScorecard';
import Profile from './features/profile/Profile';
import { LeagueDashboard } from './features/league/LeagueDashboard';

import { CreateLeague } from './features/league/CreateLeague';
import { LeagueDetails } from './features/league/LeagueDetails';

// Placeholder components
// Home component moved to features/home/Home.jsx

import { ResetPassword } from './features/auth/ResetPassword';

function App() {
  return (
    <DBProvider>
      <UserProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="courses" element={<CourseList />} />
              <Route path="courses/new" element={<CourseEditor />} />
              <Route path="courses/:id" element={<CourseEditor />} />
              <Route path="play" element={<Play />} />
              <Route path="play/:id" element={<Scorecard />} />
              <Route path="matchplay" element={<MatchplaySetup />} />
              <Route path="match-setup" element={<MatchplaySetup />} />
              <Route path="matchplay/:id" element={<MatchplayScorecard />} />

              <Route path="/profile" element={<Profile />} />
              <Route path="league" element={<LeagueDashboard />} />
              <Route path="league/create" element={<CreateLeague />} />
              <Route path="league/:id" element={<LeagueDetails />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </UserProvider>
    </DBProvider>
  );
}

export default App;
