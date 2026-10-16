import { Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './store.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewRequest from './pages/NewRequest.jsx';
import Requests from './pages/Requests.jsx';
import Items from './pages/Items.jsx';
import Vehicles from './pages/Vehicles.jsx';
import Purchasing from './pages/Purchasing.jsx';
import Maintenance from './pages/Maintenance.jsx';
import Reports from './pages/Reports.jsx';
import VehicleCosts from './pages/VehicleCosts.jsx';
import Users from './pages/Users.jsx';
import Locations from './pages/Locations.jsx';

export default function App() {
  const { user } = useStore();
  if (!user) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewRequest />} />
        <Route path="/my-requests" element={<Requests mode="mine" />} />
        <Route path="/queue" element={<Requests mode="queue" />} />
        <Route path="/all-requests" element={<Requests mode="all" />} />
        <Route path="/items" element={<Items />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/purchasing" element={<Purchasing />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/vehicle-costs" element={<VehicleCosts />} />
        <Route path="/users" element={<Users />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}