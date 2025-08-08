import { useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export default function Room({ roomId, name, role }){
  const [users,setUsers]=useState({})
  const [muted,setMuted]=useState(false)
  const [cam,setCam]=useState(false)
  const [ready,setReady]=useState(false)
  const socketRef=useRef(null)
  const peersRef=useRef({})
  const localStreamRef=useRef(null)
  const [remoteVideos,setRemoteVideos]=useState({})
  const [localVideo,setLocalVideo]=useState(null)

  useEffect(()=>{
    const url = process.env.NEXT_PUBLIC_SIGNALING_URL || 'https://REPLACE_ME.onrender.com'
    const socket = io(url, { transports:['websocket'] })
    socketRef.current = socket
    socket.on('connect', ()=>{ socket.emit('join', { roomId, name, requestedRole: role }) ; setReady(true) })
    socket.on('join-denied', ({reason})=>alert(reason))
    socket.on('room-users', r => setUsers(r))
    socket.on('signal', async ({from, data})=>{
      let pc = peersRef.current[from]; if(!pc){ pc=new RTCPeerConnection({ iceServers: ICE_SERVERS }); peersRef.current[from]=pc;
        pc.onicecandidate = (e)=>{ if(e.candidate) socket.emit('signal',{to:from,data:e.candidate}) }
        pc.ontrack = (e)=>{ setRemoteVideos(prev=>({ ...prev, [from]: URL.createObjectURL(e.streams[0]) })) }
        if(localStreamRef.current){ localStreamRef.current.getTracks().forEach(t=>pc.addTrack(t, localStreamRef.current)) }
      }
      if(data.type==='offer'){ await pc.setRemoteDescription(new RTCSessionDescription(data)); const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); socket.emit('signal',{to:from,data:pc.localDescription}) }
      else if(data.type==='answer'){ await pc.setRemoteDescription(new RTCSessionDescription(data)) }
      else if(data.candidate){ try{ await pc.addIceCandidate(new RTCIceCandidate(data)) }catch(e){} }
    })
    return ()=>{ Object.values(peersRef.current).forEach(pc=>pc.close()); if(localStreamRef.current) localStreamRef.current.getTracks().forEach(t=>t.stop()); socket.disconnect() }
  }, [])

  async function ensureMedia(kind){
    if(!localStreamRef.current){
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:cam })
      localStreamRef.current = stream; setLocalVideo(URL.createObjectURL(stream))
    }else{
      if(kind==='video'){ const v = localStreamRef.current.getVideoTracks()[0]; if(v) v.enabled = cam }
      if(kind==='audio'){ const a = localStreamRef.current.getAudioTracks()[0]; if(a) a.enabled = !muted }
    }
  }
  useEffect(()=>{ if(!ready) return; ensureMedia(); const i=setInterval(()=>{
    const ids = Object.keys(users).filter(id=>id!==socketRef.current.id); for(const id of ids){ if(!peersRef.current[id]){
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS }); peersRef.current[id]=pc;
      pc.onicecandidate=(e)=>{ if(e.candidate) socketRef.current.emit('signal',{to:id,data:e.candidate}) }
      pc.ontrack=(e)=>{ setRemoteVideos(prev=>({ ...prev, [id]: URL.createObjectURL(e.streams[0]) })) }
      if(localStreamRef.current){ localStreamRef.current.getTracks().forEach(t=>pc.addTrack(t, localStreamRef.current)) }
      pc.createOffer().then(off=>{ pc.setLocalDescription(off); socketRef.current.emit('signal',{to:id,data:pc.localDescription}) })
    }},1000); return ()=>clearInterval(i) },[ready,users])

  return (<div className="container">
    <h3>الغرفة: {roomId}</h3>
    <div className="row">
      <button className="btn" onClick={()=>{setMuted(m=>!m); ensureMedia('audio')}}>{muted?'تشغيل المايك':'كتم المايك'}</button>
      <button className="btn" onClick={()=>{setCam(c=>!c); ensureMedia('video')}}>{cam?'إيقاف الكام':'تشغيل الكام'}</button>
    </div>
    <div className="card"><h4>بثّي</h4>{localVideo ? <video src={localVideo} playsInline autoPlay muted/> : 'غير متصل'}</div>
    {Object.entries(remoteVideos).map(([pid,url])=>(<div className="card" key={pid}><h4>مشارك</h4><video src={url} playsInline autoPlay/></div>))}
  </div>)
}

export async function getServerSideProps(ctx){
  const { id } = ctx.query; const { name='ضيف', role='audience' } = ctx.query
  return { props: { roomId: id, name, role } }
}