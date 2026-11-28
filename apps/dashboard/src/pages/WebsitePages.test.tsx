import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WebsitePages from './WebsitePages';
import { WebsiteRequestError } from '../lib/website';
const state = vi.hoisted(() => ({ admin:true, request:vi.fn() }));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({hasRole:()=>state.admin})}));
vi.mock('../lib/website',async importOriginal => ({...await importOriginal<typeof import('../lib/website')>(),websiteApiUrl:()=> 'https://website.example.test/v1/admin/website',websiteRequest:state.request}));
const content = {heading:'Original heading',description:'Supporting text',photo:{propertySlug:'sample',filename:'0.jpg'},actions:[]};
const page = () => ({id:'about',label:'About',revision:0,draft:structuredClone(content),published:structuredClone(content),publishedAt:null,updatedAt:null});
function setup() { return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MemoryRouter initialEntries={['/admin/website/pages/about']}><Routes><Route path="/admin/website/pages/:pageId" element={<WebsitePages/>}/><Route path="/admin/features" element={<h1>Features</h1>}/></Routes></MemoryRouter></QueryClientProvider>); }
beforeEach(()=>{
  state.admin=true;
  state.request.mockReset().mockImplementation(async (path:string)=> {
    if(path==='pages') return {pages:[page()]};
    if(path==='media') return {properties:[{slug:'sample',name:'Sample property',photos:Array.from({length:8},(_,i)=>({filename:`${i}.jpg`,url:`https://media.example.test/${i}.jpg`,alt:'Room'}))}]};
    throw new Error('Unexpected request');
  });
});
describe('external website editor',()=>{
  it('never mounts editor controls or fetches content for nonadmin staff',()=>{
    state.admin=false;setup();expect(screen.getByRole('heading',{name:'Features'})).toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
  });
  it('saves drafts separately, requires saving before preview/publish, and opens a saved snapshot',async()=>{
    setup();const heading=await screen.findByLabelText('Heading');
    expect(screen.getByRole('button',{name:'Save draft'})).toBeDisabled();
    fireEvent.change(heading,{target:{value:'Changed heading'}});
    expect(screen.getByRole('button',{name:'Preview saved draft'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Publish'})).toBeDisabled();
    state.request.mockImplementation(async (path:string,_schema:unknown,_method:string,body:any)=>{
      if(path.endsWith('/draft')) return {...page(),revision:1,draft:body.content};
      if(path.endsWith('/preview')) return {url:'https://guest.example.test/website-preview/snapshot',expiresInSeconds:900};
      if(path.endsWith('/publish')) return {...page(),revision:2,draft:body.content,published:body.content,publishedAt:new Date().toISOString()};
      throw new Error('Unexpected request');
    });
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await screen.findByText('Draft saved. The public page has not changed.');
    expect(state.request).toHaveBeenCalledWith('pages/about/draft',expect.anything(),'PUT',expect.objectContaining({revision:0,content:expect.objectContaining({heading:'Changed heading'})}));
    fireEvent.click(screen.getByRole('button',{name:'Preview saved draft'}));
    expect(await screen.findByRole('link',{name:'Open draft preview'})).toHaveAttribute('target','_blank');
    fireEvent.click(screen.getByRole('button',{name:'Publish'}));
    await screen.findByText('Published. The public page now uses this content.');
    expect(state.request).toHaveBeenCalledWith('pages/about/publish',expect.anything(),'PUT',expect.objectContaining({revision:1}));
  });
  it('paginates six photos and changes only the selected pointer',async()=>{
    setup();await screen.findByLabelText('Heading');
    expect(screen.getAllByRole('button',{name:/^Photo \d/})).toHaveLength(6);
    expect(screen.getByRole('button',{name:'Photo 1 from Sample property'})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByRole('button',{name:'Next photos'}));
    expect(screen.getAllByRole('button',{name:/^Photo \d/})).toHaveLength(2);
    fireEvent.click(screen.getByRole('button',{name:'Photo 8 from Sample property'}));
    expect(screen.getByRole('button',{name:'Photo 8 from Sample property'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('button',{name:'Save draft'})).toBeEnabled();
  });
  it('preserves unsaved work after stale save and offers explicit recovery',async()=>{
    setup();fireEvent.change(await screen.findByLabelText('Heading'),{target:{value:'Keep my text'}});
    state.request.mockRejectedValue(new WebsiteRequestError(409));
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Another admin changed this page'));
    expect(screen.getByLabelText('Heading')).toHaveValue('Keep my text');
    expect(screen.getByRole('button',{name:'Save draft'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Reload latest version'})).toBeEnabled();
  });
});
