import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  X,
  Zap,
  Tv,
  Wifi,
  Smartphone,
  GraduationCap,
  RefreshCw,
  Building,
  HelpCircle
} from 'lucide-react';
import { apiRequest } from '../../api';
import { DynamicService, DynamicServiceField } from '../../types';

export const DynamicServicesTab: React.FC = () => {
  const [services, setServices] = useState<DynamicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit / Create Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingService, setEditingService] = useState<Partial<DynamicService>>({
    name: '',
    category: 'telecom',
    description: '',
    icon: 'Layers',
    enabled: true,
    customerVisible: true,
    provider: 'RAPIDBILLS',
    pricingType: 'catalog',
    fields: []
  });

  // Custom field builder inside modal
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<DynamicServiceField['type']>('text');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(true);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ success: boolean; services: DynamicService[] }>('/admin/services');
      setServices(res.services || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dynamic services.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnable = async (service: DynamicService) => {
    try {
      const updatedVal = !service.enabled;
      const res = await apiRequest<{ success: boolean; service: DynamicService }>(
        `/admin/services/${service.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ enabled: updatedVal })
        }
      );
      setServices(prev => prev.map(s => (s.id === service.id ? res.service : s)));
      setMessage(`Service "${service.name}" is now ${updatedVal ? 'ENABLED' : 'DISABLED'}. Customer app updated in real-time.`);
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle service.');
    }
  };

  const handleToggleVisibility = async (service: DynamicService) => {
    try {
      const updatedVal = !service.customerVisible;
      const res = await apiRequest<{ success: boolean; service: DynamicService }>(
        `/admin/services/${service.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ customerVisible: updatedVal })
        }
      );
      setServices(prev => prev.map(s => (s.id === service.id ? res.service : s)));
      setMessage(`Service "${service.name}" customer visibility set to ${updatedVal ? 'VISIBLE' : 'HIDDEN'}.`);
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update visibility.');
    }
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingService({
      id: '',
      name: '',
      category: 'telecom',
      description: '',
      icon: 'Layers',
      enabled: true,
      customerVisible: true,
      provider: 'RAPIDBILLS',
      pricingType: 'catalog',
      fixedPrice: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      fields: []
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (service: DynamicService) => {
    setModalMode('edit');
    setEditingService({ ...service });
    setIsModalOpen(true);
  };

  const handleAddField = () => {
    if (!newFieldName || !newFieldLabel) return;
    const cleanName = newFieldName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const currentFields = editingService.fields || [];
    setEditingService({
      ...editingService,
      fields: [
        ...currentFields,
        {
          name: cleanName,
          label: newFieldLabel.trim(),
          type: newFieldType,
          placeholder: newFieldPlaceholder.trim(),
          required: newFieldRequired
        }
      ]
    });
    setNewFieldName('');
    setNewFieldLabel('');
    setNewFieldPlaceholder('');
  };

  const handleRemoveField = (index: number) => {
    const currentFields = editingService.fields || [];
    setEditingService({
      ...editingService,
      fields: currentFields.filter((_, i) => i !== index)
    });
  };

  const handleSaveService = async () => {
    if (!editingService.name || !editingService.category) {
      setError('Please provide service name and category.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (modalMode === 'create') {
        const res = await apiRequest<{ success: boolean; service: DynamicService }>('/admin/services', {
          method: 'POST',
          body: JSON.stringify(editingService)
        });
        setMessage(`Created new dynamic service: ${res.service.name}`);
      } else {
        const res = await apiRequest<{ success: boolean; service: DynamicService }>(
          `/admin/services/${editingService.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(editingService)
          }
        );
        setMessage(`Updated dynamic service: ${res.service.name}`);
      }
      setTimeout(() => setMessage(null), 3500);
      setIsModalOpen(false);
      loadServices();
    } catch (err: any) {
      setError(err.message || 'Failed to save service.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!confirm(`Are you sure you want to permanently delete service "${serviceName}"?`)) return;
    try {
      await apiRequest(`/admin/services/${serviceId}`, { method: 'DELETE' });
      setMessage(`Service "${serviceName}" deleted.`);
      setTimeout(() => setMessage(null), 3500);
      loadServices();
    } catch (err: any) {
      setError(err.message || 'Failed to delete service.');
    }
  };

  return (
    <div className="space-y-5 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>Dynamic Services Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Add, enable, disable, and configure services without rebuilding code. Disabled services vanish from the customer app immediately.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Service</span>
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Services List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Loading dynamic services...</span>
        </div>
      ) : services.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
          <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No services configured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map(srv => (
            <div
              key={srv.id}
              className={`p-4 rounded-2xl border transition-all space-y-3 ${
                srv.enabled
                  ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  : 'bg-slate-900/50 border-slate-800/60 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                      srv.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{srv.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-800 text-slate-400">
                        {srv.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{srv.description || 'No description provided'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleEnable(srv)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black transition-colors ${
                      srv.enabled
                        ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {srv.enabled ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>
              </div>

              {/* Service details bar */}
              <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px]">Pricing</span>
                  <span className="font-mono text-white capitalize">{srv.pricingType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Provider</span>
                  <span className="font-mono text-white">{srv.provider}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Custom Fields</span>
                  <span className="font-mono text-white">{srv.fields?.length || 0} fields</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(srv)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                >
                  {srv.customerVisible ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Visible to Customers</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Hidden from App</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(srv)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Edit Service"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteService(srv.id, srv.name)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                    title="Delete Service"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: CREATE OR EDIT SERVICE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-white shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>{modalMode === 'create' ? 'Create Dynamic Service' : `Edit Service: ${editingService.name}`}</span>
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Service Name *</label>
                  <input
                    type="text"
                    value={editingService.name || ''}
                    onChange={e => setEditingService({ ...editingService, name: e.target.value })}
                    placeholder="e.g. Internet Broadband"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Category *</label>
                  <select
                    value={editingService.category || 'telecom'}
                    onChange={e => setEditingService({ ...editingService, category: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="telecom">Telecom</option>
                    <option value="utility">Utility</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="education">Education</option>
                    <option value="finance">Finance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">Description</label>
                <input
                  type="text"
                  value={editingService.description || ''}
                  onChange={e => setEditingService({ ...editingService, description: e.target.value })}
                  placeholder="Short customer-facing description"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Pricing Type</label>
                  <select
                    value={editingService.pricingType || 'catalog'}
                    onChange={e => setEditingService({ ...editingService, pricingType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="catalog">Catalog / Plans</option>
                    <option value="fixed">Fixed Price</option>
                    <option value="range">Customer Amount Range</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Fulfillment Provider</label>
                  <input
                    type="text"
                    value={editingService.provider || 'RAPIDBILLS'}
                    onChange={e => setEditingService({ ...editingService, provider: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Convenience Fee (₦)</label>
                  <input
                    type="number"
                    value={editingService.fee || 0}
                    onChange={e => setEditingService({ ...editingService, fee: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              {editingService.pricingType === 'fixed' && (
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Fixed Price (₦)</label>
                  <input
                    type="number"
                    value={editingService.fixedPrice || 0}
                    onChange={e => setEditingService({ ...editingService, fixedPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                  />
                </div>
              )}

              {/* Custom Input Fields Builder */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <label className="block text-slate-300 font-bold">
                  Customer Form Fields ({editingService.fields?.length || 0})
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {editingService.fields?.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{f.label}</span>
                        <span className="text-[10px] font-mono text-slate-500">({f.name}: {f.type})</span>
                        {f.required && <span className="text-[10px] text-red-400 font-bold">*Required</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(i)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new field inline */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <div className="text-[11px] font-bold text-slate-400">Add Field to Customer Form:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Field Label (e.g. Meter No)"
                      value={newFieldLabel}
                      onChange={e => {
                        setNewFieldLabel(e.target.value);
                        if (!newFieldName) setNewFieldName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                      }}
                      className="px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Variable Name (meter_no)"
                      value={newFieldName}
                      onChange={e => setNewFieldName(e.target.value)}
                      className="px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                    />
                    <select
                      value={newFieldType}
                      onChange={e => setNewFieldType(e.target.value as any)}
                      className="px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="tel">Phone / Number</option>
                      <option value="email">Email</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold"
                    >
                      + Add Field
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveService}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Service</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
