// CORREÇÃO LOGIN / MODAL PEDIDO - v20260817.1
// Este arquivo NÃO autentica usuários.
// A autenticação oficial fica exclusivamente em app.js + Supabase.

(function corrigirModalPampatto(){
  'use strict';

  function hideModal(){
    const modal=document.getElementById('orderSuccessModal');
    if(!modal)return;
    if(!modal.classList.contains('open')){
      modal.style.display='none';
      modal.setAttribute('aria-hidden','true');
    }
  }

  function init(){
    hideModal();

    const modal=document.getElementById('orderSuccessModal');
    if(!modal)return;

    const observer=new MutationObserver(()=>{
      if(modal.classList.contains('open')){
        modal.style.display='';
        modal.setAttribute('aria-hidden','false');
      }else{
        modal.style.display='none';
        modal.setAttribute('aria-hidden','true');
      }
    });

    observer.observe(modal,{
      attributes:true,
      attributeFilter:['class']
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
