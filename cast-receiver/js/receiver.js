const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();


// Debug Logger
//const castDebugLogger = cast.debug.CastDebugLogger.getInstance();
//const LOG_TAG = 'MyAPP.LOG';

// Enable debug logger and show a 'DEBUG MODE' overlay at top left corner.
//castDebugLogger.setEnabled(true);

// Show debug overlay
//castDebugLogger.showDebugLogs(false);

// Set verbosity level for Core events.
//castDebugLogger.loggerLevelByEvents = {
//	'cast.framework.events.category.CORE': cast.framework.LoggerLevel.INFO,
//	'cast.framework.events.EventType.MEDIA_STATUS': cast.framework.LoggerLevel.DEBUG
//}

// Set verbosity level for custom tags.
//castDebugLogger.loggerLevelByTags = {
//	LOG_TAG: cast.framework.LoggerLevel.DEBUG,
//};


const defaultBackdropUrl = "https://s3.dustypig.tv/cast-receiver/images/logo.png";

var TOKEN = ""
var LAST_TIME = 0
var MEDIA_TYPE = ""
var MEDIA_ID = 0


function postUpdate (secnds) {
	return new Promise(function (resolve, reject) {
		
		let xhr = new XMLHttpRequest();
		
		if(MEDIA_TYPE == "playlist") {
			xhr.open("POST", "https://service.dustypig.tv/api/v3/Playlists/SetPlaylistProgress");
		} else {
			xhr.open("POST", "https://service.dustypig.tv/api/v3/Media/UpdatePlaybackProgress");
		}
		
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.setRequestHeader("Authorization", "Bearer " + TOKEN);
		
		xhr.onload = function () {
			if (this.status >= 200 && this.status < 300) {
				resolve();
			} else {
				reject({
					status: this.status,
					statusText: xhr.statusText
				});
			}
		};
		
		xhr.onerror = function (err) {
			reject(err);
		};
		
		
		var jsonData = {
			id:MEDIA_ID,
			seconds: secnds
		}
				
		xhr.send(JSON.stringify(jsonData));
	});
}



playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, loadRequestData => {
	MEDIA_ID = loadRequestData.media.contentId;
	return loadRequestData;
});



playerManager.addEventListener(cast.framework.events.EventType.TIME_UPDATE, mediaElementEvent => {
	
	if(MEDIA_ID <= 0)
		return;
	
	var diff = Math.abs(LAST_TIME - mediaElementEvent.currentMediaTime);
	if(diff >= 1.0) {
		LAST_TIME = mediaElementEvent.currentMediaTime;
		postUpdate(mediaElementEvent.currentMediaTime);
	}
});









const CustomQueue = class extends cast.framework.QueueBase {
	
	constructor() {
		/** @private {} */
		super();
	}
	
	/**
	* Initializes the queue.
	* @param {!cast.framework.messages.LoadRequestData} loadRequestData
	* @return {!cast.framework.messages.QueueData}
	*/
	initialize(loadRequestData) {
		
		MEDIA_ID = 0;		
		TOKEN = loadRequestData.credentials;
		LAST_TIME = 0;
		
		var parts = loadRequestData.media.entity.split("://")[1].split("/");
		MEDIA_TYPE = parts[0];
		
		var mid = parts[1];
		if(MEDIA_TYPE == "series") {
			return this.loadSeries(mid);
		} else if(MEDIA_TYPE == "playlist") {
			return this.loadPlaylist(mid);
		} else { //MEDIA_TYPE == "movie"
			return this.loadMovie(mid);
		}
	}
	
	
	makeRequest (url) {
		let xhr = new XMLHttpRequest();
		xhr.open("GET", url, false);
		xhr.setRequestHeader("Authorization", "Bearer " + TOKEN);
		xhr.send();
		return JSON.parse(xhr.response);
	}
	
	
	loadSeries(seriesId) {
		
		let queueData = new cast.framework.messages.QueueData();
		queueData.items = [];
		
		const data = this.makeRequest("https://service.dustypig.tv/api/v3/Series/Details/" + seriesId);
		if (data.success && data.data.can_play) {
			
			var backdropUrl = defaultBackdropUrl;
			if (data.data.hasOwnProperty("backdrop_url") && data.data["backdrop_url"]) {
				backdropUrl = data.data.backdrop_url;
			}			
		
			var idx = 0;
			for(const ep of data.data.episodes) {
				
				const item = new cast.framework.messages.QueueItem();
				item.preloadTime = 10;
				
				item.media = new cast.framework.messages.MediaInformation();			
				item.media.contentId = ep.id.toString();
				item.media.contentUrl = ep.video_url;
				
				item.media.metadata = new cast.framework.messages.TvShowMediaMetadata();
				item.media.metadata.posterUrl = backdropUrl;
				item.media.metadata.seriesTitle = data.data.title;
				item.media.metadata.episode = ep.episode_number;
				item.media.metadata.season = ep.season_number;
				item.media.metadata.title = ep.title;
				
				
				item.media.metadata.images = [];
				item.media.metadata.images.push(new cast.framework.messages.Image(data.data.artwork_url));
				
				queueData.items.push(item);
				
				if(ep.up_next) {
					queueData.startIndex = idx;
					if(ep.hasOwnProperty("played") && ep["played"]) {
						queueData.startTime = ep.played;
					}
				}				
				idx++;
			}
		}
		
		return queueData;
	}
	
	loadPlaylist(playlistId) {
		
		let queueData = new cast.framework.messages.QueueData();
		queueData.items = [];
		
		const data = this.makeRequest("https://service.dustypig.tv/api/v3/Playlists/Details/" + playlistId);
		if (data.success && data.data.hasOwnProperty("items") && data.data["items"]) {
			
			var idx = 0;
			for(const pli of data.data.items) {
				
				const item = new cast.framework.messages.QueueItem();
				item.preloadTime = 10;
				
				item.media = new cast.framework.messages.MediaInformation();	
				item.media.contentId = pli.id.toString();
				item.media.contentUrl = pli.video_url;
				
				item.media.metadata = new cast.framework.messages.GenericMediaMetadata();
				item.media.metadata.posterUrl = defaultBackdropUrl;
				item.media.metadata.title = pli.title;
				
				item.media.metadata.images = [];
				item.media.metadata.images.push(new cast.framework.messages.Image(pli.artwork_url));
				
				queueData.items.push(item);
				
				if(data.data.hasOwnProperty("current_item_id") && data.data["current_item_id"] && pli.id == data.data.current_item_id) {
					queueData.startIndex = idx;
				}				
				idx++;
			}
			
			if(data.data.hasOwnProperty("current_progress") && data.data["current_progress"]) {
				queueData.startTime = data.data.current_progress;
			}
		}
		
		return queueData;
	}
	
	loadMovie(movieId) {
		
		let queueData = new cast.framework.messages.QueueData();
		queueData.items = [];

		const data = this.makeRequest("https://service.dustypig.tv/api/v3/Movies/Details/" + movieId);
		if (data.success && data.data.can_play) {
			
			var backdropUrl = defaultBackdropUrl;
			if (data.data.hasOwnProperty("backdrop_url") && data.data["backdrop_url"]) {
				backdropUrl = data.data.backdrop_url;
			}			
				
			const item = new cast.framework.messages.QueueItem();
						
			item.media = new cast.framework.messages.MediaInformation();			
			item.media.contentId = data.data.id.toString();
			item.media.contentUrl = data.data.video_url;
			
			item.media.metadata = new cast.framework.messages.MovieMediaMetadata();
			item.media.metadata.posterUrl = backdropUrl;
			item.media.metadata.title = data.data.title;
			item.media.metadata.releaseDate = data.data.date;
						
			item.media.metadata.images = [];
			item.media.metadata.images.push(new cast.framework.messages.Image(data.data.artwork_url));
			
			if(data.data.hasOwnProperty("played") && data.data["played"]) {
				queueData.startTime = data.data.played;
			}
			
			queueData.items.push(item);		
		}
		
		return queueData;
	}

};


context.start({queue: new CustomQueue()});
