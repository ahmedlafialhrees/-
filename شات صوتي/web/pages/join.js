import { useState } from 'react'
import { useRouter } from 'next/router'
export default function Join(){
  const [name,setName]=useState('ضيف')
  const [room,setRoom]=useState('majlis-1')
  const [role,setRole]=useState('audience')
  const router=useRouter()
  return (<div className="container">
    <h2>دخول كمستخدم</h2>
    <div className="card">
      <label>اسمك</label>
      <input value={name} onChange={e=>setName(e.target.value)} />
      <label>الغرفة</label>
      <input value={room} onChange={e=>setRoom(e.target.value)} />
      <label>الدور</label>
      <select value={role} onChange={e=>setRole(e.target.value)}>
        <option value="audience">مستمع</option>
        <option value="speaker">متحدث</option>
      </select>
      <div style={{height:12}}/>
      <button className="btn btn-primary" onClick={()=>router.push(`/room/${encodeURIComponent(room)}?name=${encodeURIComponent(name)}&role=${role}`)}>ادخل الغرفة</button>
    </div>
  </div>)
}