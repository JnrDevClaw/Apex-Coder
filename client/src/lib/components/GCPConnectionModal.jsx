import React, { useState } from 'react';
import './GCPConnectionModal.css'; // Assuming we'll create a basic CSS file or use inline styles

const GCPConnectionModal = ({ isOpen, onClose, onConnect }) => {
    const [jsonKey, setJsonKey] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            let parsedKey;
            try {
                parsedKey = JSON.parse(jsonKey);
            } catch (err) {
                throw new Error('Invalid JSON format. Please paste the entire JSON content.');
            }

            if (!parsedKey.project_id || !parsedKey.private_key || !parsedKey.client_email) {
                throw new Error('Missing required fields (project_id, private_key, client_email). Please use a valid Service Account Key.');
            }

            await onConnect(parsedKey);
            setJsonKey(''); // Clear input on success
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Connect Google Cloud Platform</h2>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="description">
                        To enable automatic deployment to Cloud Run, please upload your Service Account JSON Key.
                        <br />
                        <small>
                            Ensure the Service Account has <strong>Cloud Build Editor</strong> and <strong>Cloud Run Admin</strong> roles.
                        </small>
                    </p>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="jsonKey">Service Account Key (JSON)</label>
                            <textarea
                                id="jsonKey"
                                value={jsonKey}
                                onChange={(e) => setJsonKey(e.target.value)}
                                placeholder='Paste your JSON key here: { "type": "service_account", ... }'
                                rows={10}
                                required
                            />
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
                                Cancel
                            </button>
                            <button type="submit" className="btn-primary" disabled={isLoading || !jsonKey}>
                                {isLoading ? 'Connecting...' : 'Connect Account'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default GCPConnectionModal;
