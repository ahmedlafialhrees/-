import { useEffect, useMemo, useRef, useState } from 'react'
import io from 'socket.io-client'

export default function AdminDashboard(){
  const [pwd,setPwd]=useState('As66773707')
  const [room,setRoom]=useState('majlis-1')
  const [name,setName]=useState('Ahmed')
  const [connected,setConnected]=useState(false)
  const [users,setUsers]=useState({})
  const [roomsList,setRoomsList]=useState([])
  const [meta,setMeta]=useState({locked:false,banned:[]})
  const url = process.env.NEXT_PUBLIC_SIGNALING_URL || 'https://REPLACE_ME.onrender.com' // ستبدله لاحقًا
  const socketRef = useRef(null)

  function connect(){
    const socket = io(url, { transports:['websocket'] })
    socketRef.current = socket
    socket.on('connect', ()=>{
      socket.emit('join', { roomId: room, name, requestedRole:'owner', adminPassword: pwd })
      setConnected(true); socket.emit('rooms:list')
    })
    socket.on('room-users', r => setUsers(r))
    socket.on('room-meta', m => setMeta(m))
    socket.on('rooms:list', list => setRoomsList(list))
    socket.on('join-denied', ({reason}) => alert(reason))
  }

  function command(cmd, targetId, targetName){ socketRef.current.emit('admin:command', { cmd, targetId, targetName }) }
  function refreshRooms(){ socketRef.current.emit('rooms:list') }
  const userEntries = useMemo(()=>Object.entries(users), [users])

  return (<div className="container">
    <h2>لوحة تحكم الأدمن</h2>
    <div className="card">
      <label>كلمة السر</label><input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
      <label>الغرفة</label><input value={room} onChange={e=>setRoom(e.target.value)} />
      <label>اسمك</label><input value={name} onChange={e=>setName(e.target.value)} />
      <div style={{height:12}}/><button className="btn btn-primary" onClick={connect} disabled={connected}>اتصل كـ Owner</button>
      <div className="small">سيرفر الإشارات: {url}</div>
    </div>
    <div className="card"><h3>غرف</h3><button className="btn" onClick={refreshRooms}>تحديث</button></div>
    <div className="card"><h3>المتواجدون</h3>
      <table><thead><tr><th>الاسم</th><th>الدور</th><th>تحكم</th></tr></thead>
      <tbody>{userEntries.map(([id,u])=> (<tr key={id}><td>{u.name}</td><td>{u.role}</td>
        <td>
          <button className="btn" onClick={()=>command('promote', id)}>ترقية</button>
          <button className="btn" onClick={()=>command('demote', id)}>تنزيل</button>
          <button className="btn" onClick={()=>command('mute', id)}>كتم</button>
          <button className="btn" onClick={()=>command('unmute', id)}>إلغاء كتم</button>
          <button className="btn" onClick={()=>command('kick', id)}>طرد</button>
          <button className="btn" onClick={()=>command('ban', id, u.name)}>حظر+طرد</button>
        </td></tr>))}</tbody></table>
    </div>
  </div>)
}