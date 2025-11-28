'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('stats');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            router.push('/admin/login');
            return;
        }
        fetchStats();
    }, []);

    const getHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
    });

    const fetchStats = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/admin/stats`, getHeaders());
            setStats(response.data.stats);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch stats', error);
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                router.push('/admin/login');
            }
        }
    };

    const renderStats = () => {
        if (!stats) return <div>Loading stats...</div>;
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Users" value={stats.users.total} subValue={`${stats.users.active} active`} />
                <StatCard title="Generations" value={stats.generations.total} subValue={`${stats.generations.completed} completed`} />
                <StatCard title="Subscriptions" value={stats.subscriptions.total} subValue={`${stats.subscriptions.active} active`} />
                <StatCard title="Total Credits" value={stats.credits.total} />
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex">
                            <div className="flex-shrink-0 flex items-center font-bold text-xl">
                                PrepodavAI Admin
                            </div>
                        </div>
                        <div className="flex items-center">
                            <button
                                onClick={() => {
                                    localStorage.removeItem('adminToken');
                                    router.push('/admin/login');
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="flex space-x-4 mb-6 border-b">
                    {['stats', 'users', 'generations', 'files', 'logs'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-2 px-4 ${activeTab === tab
                                ? 'border-b-2 border-blue-500 text-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                } capitalize`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {activeTab === 'stats' && renderStats()}
                {activeTab === 'users' && <UsersTable />}
                {activeTab === 'generations' && <GenerationsTable />}
                {activeTab === 'files' && <FilesTable />}
                {activeTab === 'logs' && <LogsTable />}
            </div>
        </div>
    );
}

function StatCard({ title, value, subValue }: { title: string; value: number | string; subValue?: string }) {
    return (
        <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
                {subValue && <dd className="mt-1 text-sm text-gray-400">{subValue}</dd>}
            </div>
        </div>
    );
}

function UsersTable() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_URL}/api/admin/users`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
        }).then(res => {
            setUsers(res.data.users);
            setLoading(false);
        });
    }, []);

    if (loading) return <div>Loading users...</div>;

    return (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                        <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username || user.telegramId}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.firstName} {user.lastName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.source}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GenerationsTable() {
    const [generations, setGenerations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_URL}/api/admin/generations`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
        }).then(res => {
            setGenerations(res.data.generations);
            setLoading(false);
        });
    }, []);

    if (loading) return <div>Loading generations...</div>;

    return (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {generations.map((gen) => (
                        <tr key={gen.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{gen.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${gen.status === 'completed' ? 'bg-green-100 text-green-800' :
                                        gen.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                    {gen.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{gen.userGeneration?.user?.username || 'Unknown'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(gen.createdAt).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function FilesTable() {
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFiles = () => {
        axios.get(`${API_URL}/api/admin/files`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
        }).then(res => {
            setFiles(res.data.files);
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const handleDelete = async (hash: string) => {
        if (!confirm('Are you sure you want to delete this file?')) return;
        try {
            await axios.delete(`${API_URL}/api/admin/files/${hash}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
            });
            fetchFiles();
        } catch (error) {
            alert('Failed to delete file');
        }
    };

    if (loading) return <div>Loading files...</div>;

    return (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {files.map((file) => (
                        <tr key={file.name}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {file.name}
                                </a>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(file.createdAt).toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <button onClick={() => handleDelete(file.name.split('.')[0])} className="text-red-600 hover:text-red-900">Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LogsTable() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_URL}/api/admin/logs`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
        }).then(res => {
            setLogs(res.data.logs);
            setLoading(false);
        });
    }, []);

    if (loading) return <div>Loading logs...</div>;

    return (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log) => (
                        <tr key={log.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.level === 'error' ? 'bg-red-100 text-red-800' :
                                        log.level === 'warn' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                                    }`}>
                                    {log.level}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.category}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.message}>{log.message}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
