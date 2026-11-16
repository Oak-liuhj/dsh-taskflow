import React, { useState } from 'react';
import { TOOL_NAMES } from '../model.mjs';
import { Icon } from '../generated/icons.jsx';

export function ToolPanel({ tool, onClose, renderer }) {
  const [reload, setReload] = useState(0);
  if (!tool?.open) return null;
  return <aside className="tf-tool" aria-label={`${TOOL_NAMES[tool.kind]}工具视图`}><header className="tool-header"><Icon name={tool.kind === 'editor' ? 'code' : tool.kind}/><span>{TOOL_NAMES[tool.kind]}</span><span className="binding">{tool.taskId || tool.title}</span><button className="iconbtn" aria-label="收起工具视图" onClick={onClose}><Icon name="close"/></button></header><div className="tool-context"><Icon name="branch"/>模型调用触发展开 · 仅当前工具</div><div className="tool-content">{renderer ? renderer(tool) : tool.kind === 'browser' && tool.url ? <div className="browser-window"><div className="browser-toolbar"><button className="iconbtn" aria-label="刷新网页预览" onClick={() => setReload(r => r + 1)}><Icon name="refresh"/></button><div className="address"><Icon name="lock"/><input readOnly aria-label="工具页面地址" value={tool.url}/></div><a className="iconbtn" href={tool.url} target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开"><Icon name="expand"/></a></div><iframe key={reload} title="网页预览" src={tool.url} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/></div> : tool.kind === 'terminal' ? <pre className="terminal">{tool.content}</pre> : <div className="code-window"><div className="file-tab">{tool.title}</div><pre>{tool.content}</pre></div>}</div><footer className="tool-footer">工具视图与当前会话绑定 · 收起后回到完整对话</footer></aside>;
}

