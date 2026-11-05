import React from 'react';import {View,Text,StyleSheet} from 'react-native';import {Button,C,Mark} from './ui';
export default class ErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){if(!this.state.failed)return this.props.children;return <View style={s.page}><Mark large/><Text accessibilityRole="header" style={s.title}>Let’s get you back.</Text><Text style={s.body}>GenZ Code couldn’t open this screen. Your saved learning data hasn’t been deleted. Trying again clears the current message.</Text><Button title="Open GenZ Code again" icon="refresh-outline" onPress={()=>this.setState({failed:false})}/></View>;}
}
const s=StyleSheet.create({page:{flex:1,padding:28,gap:24,justifyContent:'center',backgroundColor:'#edf8ff'},title:{fontSize:28,fontWeight:'800',color:C.ink},body:{fontSize:17,lineHeight:26,color:C.muted}});
